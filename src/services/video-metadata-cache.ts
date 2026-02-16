import { ChannelMetadata, VideoContentDetails, VideoExtra, VideoSnippet, VideoStatistics, VideoThumbnails } from "../models/video-metadata";
import { db } from "../db/postgres";
import type { YouTubeApiVideoMetadata } from "../models/youtube-api-types";
import { youTubeService } from "./youtube";
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

interface VideoMetadataCache {
    snippet: VideoSnippet | null;
    extra: VideoExtra | null;
    content_details: VideoContentDetails | null;
    thumbnails: VideoThumbnails | null;
    statistics: VideoStatistics | null;
    channel: ChannelMetadata | null;
    snippet_fetched_at: Date | null;
    extra_fetched_at: Date | null;
    content_details_fetched_at: Date | null;
    thumbnails_fetched_at: Date | null;
    statistics_fetched_at: Date | null;
    channel_fetched_at: Date | null;
}

interface SectionUpdate<T> {
    data: T | null;
    fetchedAt: Date;
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

function hasSectionData(cache: VideoMetadataCache, section: VideoSection): boolean {
    if (section === VideoSection.Snippet) {
        return cache.snippet !== null && cache.extra !== null;
    }

    if (section === VideoSection.Statistics) {
        return cache.statistics !== null;
    }

    if (section === VideoSection.ContentDetails) {
        return cache.content_details !== null;
    }

    if (section === VideoSection.Thumbnails) {
        return cache.thumbnails !== null;
    }

    return cache.channel_fetched_at !== null;
}

function getSectionFetchedAt(cache: VideoMetadataCache, section: VideoSection): Date | null {
    if (section === VideoSection.Snippet) {
        return cache.snippet_fetched_at ?? cache.extra_fetched_at;
    }

    if (section === VideoSection.Statistics) {
        return cache.statistics_fetched_at;
    }

    if (section === VideoSection.ContentDetails) {
        return cache.content_details_fetched_at;
    }

    if (section === VideoSection.Thumbnails) {
        return cache.thumbnails_fetched_at;
    }

    return cache.channel_fetched_at;
}

async function getCache(videoId: string): Promise<VideoMetadataCache> {
    const [
        snippetRow,
        extraRow,
        contentDetailsRow,
        thumbnailsRow,
        statisticsRow,
        channelRow
    ] = await Promise.all([
        db.selectFrom("video_snippets").select(["data", "fetched_at"]).where("video_id", "=", videoId).executeTakeFirst(),
        db.selectFrom("video_extras").select(["data", "fetched_at"]).where("video_id", "=", videoId).executeTakeFirst(),
        db.selectFrom("video_content_details").select(["data", "fetched_at"]).where("video_id", "=", videoId).executeTakeFirst(),
        db.selectFrom("video_thumbnails").select(["data", "fetched_at"]).where("video_id", "=", videoId).executeTakeFirst(),
        db.selectFrom("video_statistics").select(["data", "fetched_at"]).where("video_id", "=", videoId).executeTakeFirst(),
        db.selectFrom("channel_metadata").select(["data", "fetched_at"]).where("video_id", "=", videoId).executeTakeFirst()
    ]);

    return {
        snippet: (snippetRow?.data as VideoSnippet | null) ?? null,
        extra: (extraRow?.data as VideoExtra | null) ?? null,
        content_details: (contentDetailsRow?.data as VideoContentDetails | null) ?? null,
        thumbnails: (thumbnailsRow?.data as VideoThumbnails | null) ?? null,
        statistics: (statisticsRow?.data as VideoStatistics | null) ?? null,
        channel: (channelRow?.data as ChannelMetadata | null) ?? null,
        snippet_fetched_at: snippetRow?.fetched_at ?? null,
        extra_fetched_at: extraRow?.fetched_at ?? null,
        content_details_fetched_at: contentDetailsRow?.fetched_at ?? null,
        thumbnails_fetched_at: thumbnailsRow?.fetched_at ?? null,
        statistics_fetched_at: statisticsRow?.fetched_at ?? null,
        channel_fetched_at: channelRow?.fetched_at ?? null
    };
}

async function upsertSnippet(videoId: string, update: SectionUpdate<VideoSnippet>): Promise<void> {
    await db
        .insertInto("video_snippets")
        .values({ video_id: videoId, data: update.data, fetched_at: update.fetchedAt })
        .onConflict((oc) =>
            oc.column("video_id").doUpdateSet({ data: update.data, fetched_at: update.fetchedAt })
        )
        .execute();
}

async function upsertExtra(videoId: string, update: SectionUpdate<VideoExtra>): Promise<void> {
    await db
        .insertInto("video_extras")
        .values({ video_id: videoId, data: update.data, fetched_at: update.fetchedAt })
        .onConflict((oc) =>
            oc.column("video_id").doUpdateSet({ data: update.data, fetched_at: update.fetchedAt })
        )
        .execute();
}

async function upsertContentDetails(videoId: string, update: SectionUpdate<VideoContentDetails>): Promise<void> {
    await db
        .insertInto("video_content_details")
        .values({ video_id: videoId, data: update.data, fetched_at: update.fetchedAt })
        .onConflict((oc) =>
            oc.column("video_id").doUpdateSet({ data: update.data, fetched_at: update.fetchedAt })
        )
        .execute();
}

async function upsertThumbnails(videoId: string, update: SectionUpdate<VideoThumbnails>): Promise<void> {
    await db
        .insertInto("video_thumbnails")
        .values({ video_id: videoId, data: update.data, fetched_at: update.fetchedAt })
        .onConflict((oc) =>
            oc.column("video_id").doUpdateSet({ data: update.data, fetched_at: update.fetchedAt })
        )
        .execute();
}

async function upsertStatistics(videoId: string, update: SectionUpdate<VideoStatistics>): Promise<void> {
    await db
        .insertInto("video_statistics")
        .values({ video_id: videoId, data: update.data, fetched_at: update.fetchedAt })
        .onConflict((oc) =>
            oc.column("video_id").doUpdateSet({ data: update.data, fetched_at: update.fetchedAt })
        )
        .execute();
}

async function upsertChannel(videoId: string, update: SectionUpdate<ChannelMetadata>): Promise<void> {
    await db
        .insertInto("channel_metadata")
        .values({ video_id: videoId, data: update.data, fetched_at: update.fetchedAt })
        .onConflict((oc) =>
            oc.column("video_id").doUpdateSet({ data: update.data, fetched_at: update.fetchedAt })
        )
        .execute();
}

async function refreshSections(videoId: string, sections: VideoSection[]): Promise<void> {
    const targetSections = uniqueSections(sections);
    if (targetSections.length === 0) {
        return;
    }

    const existing = await getCache(videoId);
    const now = new Date();
    const updates: {
        snippet?: SectionUpdate<VideoSnippet>;
        extra?: SectionUpdate<VideoExtra>;
        content_details?: SectionUpdate<VideoContentDetails>;
        thumbnails?: SectionUpdate<VideoThumbnails>;
        statistics?: SectionUpdate<VideoStatistics>;
        channel?: SectionUpdate<ChannelMetadata>;
    } = {};

    if (targetSections.includes(VideoSection.Thumbnails)) {
        updates.thumbnails = { data: youTubeService.buildThumbnailSet(videoId), fetchedAt: now };
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
        const partsData = await youTubeService.fetchVideoParts(videoId, videoParts);

        if (partsData.snippet) {
            updates.snippet = { data: partsData.snippet, fetchedAt: now };
            updates.extra = {
                data: partsData.extra ?? {
                    tags: [],
                    categoryId: null,
                    defaultLanguage: null
                },
                fetchedAt: now
            };
        }

        if (partsData.statistics) {
            updates.statistics = { data: partsData.statistics, fetchedAt: now };
        }

        if (partsData.contentDetails) {
            updates.content_details = { data: partsData.contentDetails, fetchedAt: now };
        }
    }

    if (targetSections.includes(VideoSection.Channel)) {
        const snippetFromUpdate = updates.snippet?.data;
        const snippetFromCache = existing.snippet;
        const channelId = snippetFromUpdate?.channelId ?? snippetFromCache?.channelId ?? null;

        if (channelId) {
            updates.channel = { data: await youTubeService.fetchChannelMetadata(channelId), fetchedAt: now };
        } else {
            updates.channel = { data: null, fetchedAt: now };
        }
    }

    const operations: Promise<void>[] = [];
    if (updates.snippet) {
        operations.push(upsertSnippet(videoId, updates.snippet));
    }
    if (updates.extra) {
        operations.push(upsertExtra(videoId, updates.extra));
    }
    if (updates.content_details) {
        operations.push(upsertContentDetails(videoId, updates.content_details));
    }
    if (updates.thumbnails) {
        operations.push(upsertThumbnails(videoId, updates.thumbnails));
    }
    if (updates.statistics) {
        operations.push(upsertStatistics(videoId, updates.statistics));
    }
    if (updates.channel) {
        operations.push(upsertChannel(videoId, updates.channel));
    }

    if (operations.length > 0) {
        await Promise.all(operations);
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
): Promise<VideoMetadataCache> {
    const sections = uniqueSections(requestedSections);
    let cache = await getCache(videoId);

    if (forceRefresh) {
        await refreshSections(videoId, sections);
        return getCache(videoId);
    }

    const missing = sections.filter((section) => !hasSectionData(cache, section));
    if (missing.length > 0) {
        await refreshSections(videoId, missing);
        cache = await getCache(videoId);
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
    return thumbnails ?? youTubeService.buildThumbnailSet(videoId);
}

function toMetadata(videoId: string, cache: VideoMetadataCache): YouTubeApiVideoMetadata {
    const snippet = cache.snippet;
    return {
        videoId,
        url: canonicalYouTubeUrl(videoId),
        title: snippet?.title ?? null,
        description: snippet?.description ?? null,
        publishedAt: snippet?.publishedAt ?? null,
        thumbnails: toThumbnails(videoId, cache.thumbnails),
        statistics: toStatistics(cache.statistics),
        contentDetails: toContentDetails(cache.content_details),
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
