import mongoose from "mongoose";
import { connectToDatabase } from "../db/mongoose";
import { VideoMetadataCacheModel } from "../models/video-metadata-cache";
import { VideoLinkModel } from "../models/video-link";
import { getCachedVideoStatistics } from "../services/video-metadata-cache";
import { createLogger } from "../utils/logger";

/**
 * Simple in-process cron worker.
 *
 * Improvements for higher scale:
 * - Move scheduling to a queue system (BullMQ/Redis) with retries and backoff.
 * - Batch YouTube API calls by multiple videoIds per request.
 * - Use distributed locking so only one worker handles a given shard.
 * - Drive priority from real traffic metrics and quota budget.
 */

const TICK_MS = 60 * 1000;
const MAX_VIDEOS_PER_RUN = 200;
const CONCURRENCY = 5;

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MIN_MS = 60 * 1000;
const workerLogger = createLogger("metadata-worker");

interface WorkerVideo {
  videoId: string;
  elo: number | null;
  createdAt: Date;
  lastRequestedAt: Date | null;
}

function getTargetRefreshMs(video: WorkerVideo): number {
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
  const now = Date.now();
  const activeCutoff = new Date(now - 7 * DAY_MS);
  const newVideoCutoff = new Date(now - 2 * DAY_MS);

  const videos = (await VideoLinkModel.find({
    $or: [
      { lastRequestedAt: { $gte: activeCutoff } },
      { createdAt: { $gte: newVideoCutoff } },
      { elo: { $gte: 1200 } }
    ]
  })
    .sort({ lastRequestedAt: -1, elo: -1, createdAt: -1 })
    .limit(MAX_VIDEOS_PER_RUN)
    .select({ videoId: 1, elo: 1, createdAt: 1, lastRequestedAt: 1 })
    .lean()) as WorkerVideo[];

  if (videos.length === 0) {
    workerLogger.debug("No candidate videos");
    return;
  }

  const videoIds = videos.map((video) => video.videoId);
  const caches = await VideoMetadataCacheModel.find({
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
    workerLogger.debug({ checked: videos.length, due: 0 }, "Metadata cycle complete");
    return;
  }

  let success = 0;
  let failed = 0;

  await runWithConcurrency(dueVideos, CONCURRENCY, async (video) => {
    try {
      await getCachedVideoStatistics(video.videoId, true);
      success += 1;
    } catch (error) {
      failed += 1;
      workerLogger.error({ err: error, videoId: video.videoId }, "Failed metadata refresh for video");
    }
  });

  workerLogger.info(
    { checked: videos.length, due: dueVideos.length, refreshed: success, failed },
    "Metadata cycle complete"
  );
}

async function startWorker(): Promise<void> {
  await connectToDatabase();
  workerLogger.info("Worker started");

  await runRefreshCycle();
  const interval = setInterval(() => {
    void runRefreshCycle();
  }, TICK_MS);

  const stop = async () => {
    clearInterval(interval);
    await mongoose.disconnect();
    workerLogger.info("Worker stopped");
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void stop();
  });
  process.on("SIGTERM", () => {
    void stop();
  });
}

startWorker().catch((error) => {
  workerLogger.fatal({ err: error }, "Worker fatal error");
  process.exit(1);
});
