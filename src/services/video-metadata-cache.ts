import { VideoMetadataCacheDocument, VideoMetadataCacheModel } from "../models/video-metadata-cache";
import {
  ChannelMetadata,
  VideoContentDetails,
  VideoExtra,
  VideoMetadata,
  VideoPart,
  VideoSnippet,
  VideoStatistics,
  VideoThumbnails,
  buildThumbnailSet,
  fetchChannelMetadata,
  fetchVideoParts
} from "./youtube";
import { canonicalYouTubeUrl } from "../utils/youtube-url";
import { createLogger } from "../utils/logger";

export enum CacheSection {
  Snippet = "snippet",
  Statistics = "statistics",
  ContentDetails = "contentDetails",
  Thumbnails = "thumbnails",
  Channel = "channel"
}

const cacheLogger = createLogger("video-metadata-cache");

const FIVE_MINUTES = 5 * 60 * 1000;
const TWENTY_MINUTES = 20 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

const SECTION_TTL_MS: Record<CacheSection, number> = {
  [CacheSection.Snippet]: ONE_DAY,
  [CacheSection.Statistics]: FIVE_MINUTES,
  [CacheSection.ContentDetails]: ONE_DAY,
  [CacheSection.Thumbnails]: ONE_DAY,
  [CacheSection.Channel]: TWENTY_MINUTES
};

const refreshInFlight = new Map<string, Promise<void>>();

function uniqueSections(sections: CacheSection[]): CacheSection[] {
  return Array.from(new Set(sections));
}

function isExpired(date: Date | null, ttlMs: number): boolean {
  if (!date) {
    return true;
  }
  return Date.now() - date.getTime() > ttlMs;
}

function hasSectionData(cache: VideoMetadataCacheDocument, section: CacheSection): boolean {
  if (section === CacheSection.Snippet) {
    return cache.snippet !== null && cache.extra !== null;
  }

  if (section === CacheSection.Statistics) {
    return cache.statistics !== null;
  }

  if (section === CacheSection.ContentDetails) {
    return cache.contentDetails !== null;
  }

  if (section === CacheSection.Thumbnails) {
    return cache.thumbnails !== null;
  }

  return cache.channelFetchedAt !== null;
}

function getSectionFetchedAt(cache: VideoMetadataCacheDocument, section: CacheSection): Date | null {
  if (section === CacheSection.Snippet) {
    return cache.snippetFetchedAt;
  }

  if (section === CacheSection.Statistics) {
    return cache.statisticsFetchedAt;
  }

  if (section === CacheSection.ContentDetails) {
    return cache.contentDetailsFetchedAt;
  }

  if (section === CacheSection.Thumbnails) {
    return cache.thumbnailsFetchedAt;
  }

  return cache.channelFetchedAt;
}

async function getOrCreateCache(videoId: string): Promise<VideoMetadataCacheDocument> {
  const existing = await VideoMetadataCacheModel.findOne({ videoId });
  if (existing) {
    return existing;
  }

  try {
    return await VideoMetadataCacheModel.create({ videoId });
  } catch {
    const raceWinner = await VideoMetadataCacheModel.findOne({ videoId });
    if (raceWinner) {
      return raceWinner;
    }
    throw new Error(`Failed to create metadata cache for video ${videoId}`);
  }
}

async function refreshSections(videoId: string, sections: CacheSection[]): Promise<void> {
  const targetSections = uniqueSections(sections);
  if (targetSections.length === 0) {
    return;
  }

  const existing = await getOrCreateCache(videoId);
  const now = new Date();
  const updates: Record<string, unknown> = {};

  if (targetSections.includes(CacheSection.Thumbnails)) {
    updates.thumbnails = buildThumbnailSet(videoId);
    updates.thumbnailsFetchedAt = now;
  }

  const videoParts: VideoPart[] = [];
  if (targetSections.includes(CacheSection.Snippet) || targetSections.includes(CacheSection.Channel)) {
    videoParts.push("snippet");
  }
  if (targetSections.includes(CacheSection.Statistics)) {
    videoParts.push("statistics");
  }
  if (targetSections.includes(CacheSection.ContentDetails)) {
    videoParts.push("contentDetails");
  }

  if (videoParts.length > 0) {
    const partsData = await fetchVideoParts(videoId, videoParts);

    if (partsData.snippet) {
      updates.snippet = partsData.snippet;
      updates.extra = partsData.extra ?? {
        tags: [],
        categoryId: null,
        defaultLanguage: null
      };
      updates.snippetFetchedAt = now;
    }

    if (partsData.statistics) {
      updates.statistics = partsData.statistics;
      updates.statisticsFetchedAt = now;
    }

    if (partsData.contentDetails) {
      updates.contentDetails = partsData.contentDetails;
      updates.contentDetailsFetchedAt = now;
    }
  }

  if (targetSections.includes(CacheSection.Channel)) {
    const snippetFromUpdate = updates.snippet as VideoSnippet | undefined;
    const snippetFromCache = existing.snippet as VideoSnippet | null;
    const channelId = snippetFromUpdate?.channelId ?? snippetFromCache?.channelId ?? null;

    if (channelId) {
      updates.channel = await fetchChannelMetadata(channelId);
    } else {
      updates.channel = null;
    }
    updates.channelFetchedAt = now;
  }

  if (Object.keys(updates).length > 0) {
    await VideoMetadataCacheModel.findOneAndUpdate(
      { videoId },
      { $set: updates },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
}

function queueBackgroundRefresh(videoId: string, sections: CacheSection[]): void {
  if (refreshInFlight.has(videoId)) {
    return;
  }

  const targetSections = uniqueSections(sections);
  if (targetSections.length === 0) {
    return;
  }

  const task = refreshSections(videoId, targetSections)
    .catch((error) => {
      cacheLogger.error({ err: error, videoId }, "Background refresh failed");
    })
    .finally(() => {
      refreshInFlight.delete(videoId);
    });

  refreshInFlight.set(videoId, task);
}

async function ensureSections(
  videoId: string,
  requestedSections: CacheSection[],
  forceRefresh = false
): Promise<VideoMetadataCacheDocument> {
  const sections = uniqueSections(requestedSections);
  let cache = await getOrCreateCache(videoId);

  if (forceRefresh) {
    await refreshSections(videoId, sections);
    return getOrCreateCache(videoId);
  }

  const missing = sections.filter((section) => !hasSectionData(cache, section));
  if (missing.length > 0) {
    await refreshSections(videoId, missing);
    cache = await getOrCreateCache(videoId);
  }

  const expired = sections.filter((section) => {
    if (!hasSectionData(cache, section)) {
      return false;
    }
    return isExpired(getSectionFetchedAt(cache, section), SECTION_TTL_MS[section]);
  });

  if (expired.length > 0) {
    // Serve stale response now and refresh asynchronously.
    queueBackgroundRefresh(videoId, expired);
  }

  return cache;
}

function toStatistics(value: unknown): VideoStatistics {
  const stats = value as VideoStatistics | null;
  return stats ?? {
    views: null,
    likes: null,
    comments: null,
    favorites: null
  };
}

function toContentDetails(value: unknown): VideoContentDetails {
  const details = value as VideoContentDetails | null;
  return details ?? {
    duration: null,
    definition: null,
    caption: null,
    licensedContent: null
  };
}

function toExtra(value: unknown): VideoExtra {
  const extra = value as VideoExtra | null;
  return extra ?? {
    tags: [],
    categoryId: null,
    defaultLanguage: null
  };
}

function toThumbnails(videoId: string, value: unknown): VideoThumbnails {
  const thumbnails = value as VideoThumbnails | null;
  return thumbnails ?? buildThumbnailSet(videoId);
}

function toMetadata(videoId: string, cache: VideoMetadataCacheDocument): VideoMetadata {
  const snippet = cache.snippet as VideoSnippet | null;

  return {
    videoId,
    url: canonicalYouTubeUrl(videoId),
    title: snippet?.title ?? null,
    description: snippet?.description ?? null,
    publishedAt: snippet?.publishedAt ?? null,
    thumbnails: toThumbnails(videoId, cache.thumbnails),
    statistics: toStatistics(cache.statistics),
    contentDetails: toContentDetails(cache.contentDetails),
    extra: toExtra(cache.extra),
    channel: (cache.channel as ChannelMetadata | null) ?? null
  };
}

export async function getCachedVideoMetadata(videoId: string, forceRefresh = false): Promise<VideoMetadata> {
  const cache = await ensureSections(
    videoId,
    [CacheSection.Snippet, CacheSection.Statistics, CacheSection.ContentDetails, CacheSection.Thumbnails, CacheSection.Channel],
    forceRefresh
  );
  return toMetadata(videoId, cache);
}

export async function getCachedVideoStatistics(videoId: string, forceRefresh = false): Promise<VideoStatistics> {
  const cache = await ensureSections(videoId, [CacheSection.Statistics], forceRefresh);
  return toStatistics(cache.statistics);
}

export async function getCachedVideoThumbnails(videoId: string, forceRefresh = false): Promise<VideoThumbnails> {
  const cache = await ensureSections(videoId, [CacheSection.Thumbnails], forceRefresh);
  return toThumbnails(videoId, cache.thumbnails);
}

export async function getCachedVideoChannel(videoId: string, forceRefresh = false): Promise<ChannelMetadata | null> {
  const cache = await ensureSections(videoId, [CacheSection.Channel], forceRefresh);
  return (cache.channel as ChannelMetadata | null) ?? null;
}
