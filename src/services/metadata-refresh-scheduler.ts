import { db } from "../db/postgres";
import type { VideoRow } from "../db/types";
import { env } from "../config/env";
import { getCachedVideoStatistics } from "./video-metadata-cache";
import { createLogger } from "../utils/logger";

/**
 * Simple in-process scheduler.
 *
 * Improvements for higher scale:
 * - Move scheduling to a queue system (BullMQ/Redis) with retries and backoff.
 * - Batch YouTube API calls by multiple videoIds per request.
 * - Use distributed locking so only one worker handles a given shard.
 * - Drive priority from real traffic metrics and quota budget.
 */

const schedulerLogger = createLogger("metadata-scheduler");
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MIN_MS = 60 * 1000;

let intervalRef: NodeJS.Timeout | null = null;
let cycleInProgress = false;

type RefreshCandidate = Pick<VideoRow, "video_id" | "elo" | "created_at" | "last_requested_at">;

function getTargetRefreshMs(video: RefreshCandidate): number {
    const now = Date.now();
    const lastRequestedAt = video.last_requested_at?.getTime() ?? 0;
    const ageMs = now - video.created_at.getTime();

    if ((lastRequestedAt > 0 && now - lastRequestedAt <= 30 * MIN_MS) || (video.elo ?? 0) >= 1600) {
        return 5 * MIN_MS;
    }

    if ((lastRequestedAt > 0 && now - lastRequestedAt <= 6 * HOUR_MS) || (video.elo ?? 0) >= 1200) {
        return 15 * MIN_MS;
    }

    if (ageMs <= 2 * DAY_MS) {
        return 30 * MIN_MS;
    }

    return 2 * HOUR_MS;
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
    const queue = [...items];
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (queue.length > 0) {
            const item = queue.shift();
            if (!item) {
                return;
            }
            await worker(item);
        }
    });

    await Promise.all(workers);
}

async function runRefreshCycle(): Promise<void> {
    schedulerLogger.info("Starting new metadata refresh cycle");

    if (cycleInProgress) {
        schedulerLogger.warn("Previous metadata cycle still in progress, skipping this tick");
        return;
    }

    cycleInProgress = true;
    try {
        const now = Date.now();
        const activeCutoff = new Date(now - 7 * DAY_MS);
        const newVideoCutoff = new Date(now - 2 * DAY_MS);

        const videos = await db
            .selectFrom("videos")
            .select(["video_id", "elo", "created_at", "last_requested_at"])
            .where((eb) =>
                eb.or([
                    eb("last_requested_at", ">=", activeCutoff),
                    eb("created_at", ">=", newVideoCutoff),
                    eb("elo", ">=", 1200)
                ])
            )
            .orderBy("last_requested_at", "desc")
            .orderBy("elo", "desc")
            .orderBy("created_at", "desc")
            .limit(env.METADATA_REFRESH_MAX_VIDEOS_PER_RUN)
            .execute();

        if (videos.length === 0) {
            schedulerLogger.info("No candidate videos");
            return;
        }

        const videoIds = videos.map((video) => video.video_id);
        const caches = await db
            .selectFrom("video_statistics")
            .select(["video_id", "fetched_at"])
            .where("video_id", "in", videoIds)
            .execute();

        const statsFetchedAtByVideoId = new Map<string, Date | null>();
        for (const cache of caches) {
            statsFetchedAtByVideoId.set(cache.video_id, cache.fetched_at ?? null);
        }

        const dueVideos = videos.filter((video) => {
            const statsFetchedAt = statsFetchedAtByVideoId.get(video.video_id);
            if (!statsFetchedAt) {
                return true;
            }
            return now - statsFetchedAt.getTime() >= getTargetRefreshMs(video);
        });

        if (dueVideos.length === 0) {
            schedulerLogger.info({ checked: videos.length, due: 0 }, "Metadata cycle complete");
            return;
        }

        let success = 0;
        let failed = 0;

        await runWithConcurrency(dueVideos, env.METADATA_REFRESH_CONCURRENCY, async (video) => {
            try {
                await getCachedVideoStatistics(video.video_id, true);
                success += 1;
            } catch (error) {
                failed += 1;
                schedulerLogger.error({ err: error, videoId: video.video_id }, "Failed metadata refresh for video");
            }
        });

        schedulerLogger.info(
            { checked: videos.length, due: dueVideos.length, refreshed: success, failed },
            "Metadata cycle complete"
        );
    } finally {
        cycleInProgress = false;
    }
}

export function startMetadataRefreshScheduler(): void {
    if (!env.METADATA_REFRESH_ENABLED) {
        schedulerLogger.info("Metadata scheduler disabled");
        return;
    }

    if (intervalRef) {
        return;
    }

    schedulerLogger.info(
        {
            intervalMs: env.METADATA_REFRESH_INTERVAL_MS,
            maxVideosPerRun: env.METADATA_REFRESH_MAX_VIDEOS_PER_RUN,
            concurrency: env.METADATA_REFRESH_CONCURRENCY
        },
        "Metadata scheduler started"
    );

    void runRefreshCycle();
    intervalRef = setInterval(() => {
        void runRefreshCycle();
    }, env.METADATA_REFRESH_INTERVAL_MS);
}

export function stopMetadataRefreshScheduler(): void {
    if (!intervalRef) {
        return;
    }
    clearInterval(intervalRef);
    intervalRef = null;
    schedulerLogger.info("Metadata scheduler stopped");
}
