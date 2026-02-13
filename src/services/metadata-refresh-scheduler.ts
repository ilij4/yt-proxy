import { VideoMetadataModel } from "../models/video-metadata";
import { Video, VideoModel } from "../models/video";
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

function getTargetRefreshMs(video: Video): number {
    const now = Date.now();
    const lastRequestedAt = video.lastRequestedAt?.getTime() ?? 0;
    const ageMs = now - video.createdAt.getTime();

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

        const videos = (await VideoModel.find({
            $or: [
                { lastRequestedAt: { $gte: activeCutoff } },
                { createdAt: { $gte: newVideoCutoff } },
                { elo: { $gte: 1200 } }
            ]
        })
            .sort({ lastRequestedAt: -1, elo: -1, createdAt: -1 })
            .limit(env.METADATA_REFRESH_MAX_VIDEOS_PER_RUN)
            .select({ videoId: 1, elo: 1, createdAt: 1, lastRequestedAt: 1 })
            .lean());

        if (videos.length === 0) {
            schedulerLogger.info("No candidate videos");
            return;
        }

        const videoIds = videos.map((video) => video.videoId);
        const caches = await VideoMetadataModel.find({
            videoId: { $in: videoIds }
        })
            .select({ videoId: 1, statisticsFetchedAt: 1 })
            .lean();

        const statsFetchedAtByVideoId = new Map<string, Date | null>();
        for (const cache of caches) {
            statsFetchedAtByVideoId.set(cache.videoId, cache.statisticsFetchedAt ?? null);
        }

        const dueVideos = videos.filter((video) => {
            const statsFetchedAt = statsFetchedAtByVideoId.get(video.videoId);
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
                await getCachedVideoStatistics(video.videoId, true);
                success += 1;
            } catch (error) {
                failed += 1;
                schedulerLogger.error({ err: error, videoId: video.videoId }, "Failed metadata refresh for video");
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
