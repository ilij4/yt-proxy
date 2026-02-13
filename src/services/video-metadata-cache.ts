import { ChannelMetadata, VideoContentDetails, VideoExtra, VideoMetadataDocument, VideoMetadataModel, VideoSnippet, VideoStatistics, VideoThumbnails } from "../models/video-metadata";
import type {
    YouTubeApiVideoMetadata,
} from "../models/youtube-api-types";
import {
    buildThumbnailSet,
    fetchChannelMetadata,
    fetchVideoParts
} from "./youtube";
import { VideoSection, type VideoPart } from "./video-sections";
import { canonicalYouTubeUrl } from "../utils/youtube-url";
import { createLogger } from "../utils/logger";

export { VideoSection } from "./video-sections";

const cacheLogger = createLogger("video-metadata-cache");

const FIVE_MINUTES = 5 * 60 * 1000;
const TWENTY_MINUTES = 20 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

const SECTION_TTL_MS: Record<VideoSection, number> = {
    [VideoSection.Snippet]: ONE_DAY,
    [VideoSection.Statistics]: FIVE_MINUTES,
    [VideoSection.ContentDetails]: ONE_DAY,
    [VideoSection.Thumbnails]: ONE_DAY,
    [VideoSection.Channel]: TWENTY_MINUTES
};

const refreshInFlight = new Map<string, Promise<void>>();

interface CacheUpdates {
    snippet?: VideoSnippet | null;
    extra?: VideoExtra | null;
    contentDetails?: VideoContentDetails | null;
    thumbnails?: VideoThumbnails | null;
    statistics?: VideoStatistics | null;
    channel?: ChannelMetadata | null;
    snippetFetchedAt?: Date | null;
    contentDetailsFetchedAt?: Date | null;
    thumbnailsFetchedAt?: Date | null;
    statisticsFetchedAt?: Date | null;
    channelFetchedAt?: Date | null;
}

function uniqueSections(sections: VideoSection[]): VideoSection[] {
    return Array.from(new Set(sections));
}

function isExpired(date: Date | null, ttlMs: number): boolean {
    if (!date) {
        return true;
    }
    return Date.now() - date.getTime() > ttlMs;
}

function hasSectionData(cache: VideoMetadataDocument, section: VideoSection): boolean {
    if (section === VideoSection.Snippet) {
        return cache.snippet !== null && cache.extra !== null;
    }

    if (section === VideoSection.Statistics) {
        return cache.statistics !== null;
    }

    if (section === VideoSection.ContentDetails) {
        return cache.contentDetails !== null;
    }

    if (section === VideoSection.Thumbnails) {
        return cache.thumbnails !== null;
    }

    return cache.channelFetchedAt !== null;
}

function getSectionFetchedAt(cache: VideoMetadataDocument, section: VideoSection): Date | null {
    if (section === VideoSection.Snippet) {
        return cache.snippetFetchedAt;
    }

    if (section === VideoSection.Statistics) {
        return cache.statisticsFetchedAt;
    }

    if (section === VideoSection.ContentDetails) {
        return cache.contentDetailsFetchedAt;
    }

    if (section === VideoSection.Thumbnails) {
        return cache.thumbnailsFetchedAt;
    }

    return cache.channelFetchedAt;
}

async function getOrCreateCache(videoId: string): Promise<VideoMetadataDocument> {
    const existing = await VideoMetadataModel.findOne({ videoId });
    if (existing) {
        return existing;
    }

    try {
        return await VideoMetadataModel.create({ videoId });
    } catch {
        const raceWinner = await VideoMetadataModel.findOne({ videoId });
        if (raceWinner) {
            return raceWinner;
        }
        throw new Error(`Failed to create metadata cache for video ${videoId}`);
    }
}

async function refreshSections(videoId: string, sections: VideoSection[]): Promise<void> {
    const targetSections = uniqueSections(sections);
    if (targetSections.length === 0) {
        return;
    }

    const existing = await getOrCreateCache(videoId);
    const now = new Date();
    const updates: CacheUpdates = {};

    if (targetSections.includes(VideoSection.Thumbnails)) {
        updates.thumbnails = buildThumbnailSet(videoId);
        updates.thumbnailsFetchedAt = now;
    }

    const videoParts: VideoPart[] = [];
    if (targetSections.includes(VideoSection.Snippet) || targetSections.includes(VideoSection.Channel)) {
        videoParts.push(VideoSection.Snippet);
    }
    if (targetSections.includes(VideoSection.Statistics)) {
        videoParts.push(VideoSection.Statistics);
    }
    if (targetSections.includes(VideoSection.ContentDetails)) {
        videoParts.push(VideoSection.ContentDetails);
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

    if (targetSections.includes(VideoSection.Channel)) {
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
        await VideoMetadataModel.findOneAndUpdate(
            { videoId },
            { $set: updates },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
    }
}

function queueBackgroundRefresh(videoId: string, sections: VideoSection[]): void {
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
    requestedSections: VideoSection[],
    forceRefresh = false
): Promise<VideoMetadataDocument> {
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

function toMetadata(videoId: string, cache: VideoMetadataDocument): YouTubeApiVideoMetadata {
    const snippet = cache.snippet;
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
        channel: cache.channel ?? null
    };
}

export async function getCachedVideoMetadata(videoId: string, forceRefresh = false): Promise<YouTubeApiVideoMetadata> {
    const cache = await ensureSections(
        videoId,
        [VideoSection.Snippet, VideoSection.Statistics, VideoSection.ContentDetails, VideoSection.Thumbnails, VideoSection.Channel],
        forceRefresh
    );
    return toMetadata(videoId, cache);
}

export async function getCachedVideoStatistics(videoId: string, forceRefresh = false): Promise<VideoStatistics> {
    const cache = await ensureSections(videoId, [VideoSection.Statistics], forceRefresh);
    return toStatistics(cache.statistics);
}

export async function getCachedVideoThumbnails(videoId: string, forceRefresh = false): Promise<VideoThumbnails> {
    const cache = await ensureSections(videoId, [VideoSection.Thumbnails], forceRefresh);
    return toThumbnails(videoId, cache.thumbnails);
}

export async function getCachedVideoChannel(videoId: string, forceRefresh = false): Promise<ChannelMetadata | null> {
    const cache = await ensureSections(videoId, [VideoSection.Channel], forceRefresh);
    return cache.channel ?? null;
}
