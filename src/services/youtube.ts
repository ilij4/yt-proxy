import axios from "axios";
import { env } from "../config/env";
import type {
    YouTubeApiVideoMetadata,
    YouTubeApiVideoPartsResult,
} from "../models/youtube-api-types";
import { canonicalYouTubeUrl } from "../utils/youtube-url";
import { VideoSection, type VideoPart } from "./video-sections";
import { VideoThumbnails, ChannelMetadata } from "../models/video-metadata";

interface YouTubeApiVideosResponse {
    items: Array<{
        id: string;
        snippet?: {
            title?: string;
            description?: string;
            publishedAt?: string;
            channelId?: string;
            channelTitle?: string;
            tags?: string[];
            categoryId?: string;
            defaultLanguage?: string;
        };
        statistics?: {
            viewCount?: string;
            likeCount?: string;
            commentCount?: string;
            favoriteCount?: string;
        };
        contentDetails?: {
            duration?: string;
            definition?: string;
            caption?: string;
            licensedContent?: boolean;
        };
    }>;
}

interface YouTubeApiChannelsResponse {
    items: Array<{
        id: string;
        snippet?: {
            title?: string;
            description?: string;
            customUrl?: string;
            thumbnails?: {
                default?: { url?: string };
                medium?: { url?: string };
                high?: { url?: string };
            };
        };
        statistics?: {
            subscriberCount?: string;
            videoCount?: string;
            viewCount?: string;
            hiddenSubscriberCount?: boolean;
        };
    }>;
}

function parseCount(value?: string): number | null {
    if (!value) {
        return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

export class YouTubeService {
    buildThumbnailSet(videoId: string): VideoThumbnails {
        const base = `https://i.ytimg.com/vi/${videoId}`;
        return {
            default: `${base}/default.jpg`,
            medium: `${base}/mqdefault.jpg`,
            high: `${base}/hqdefault.jpg`
        };
    }

    async fetchVideoParts(videoId: string, parts: VideoPart[]): Promise<YouTubeApiVideoPartsResult> {
        if (parts.length === 0) {
            return {};
        }

        const uniqueParts = Array.from(new Set(parts));
        const response = await axios.get<YouTubeApiVideosResponse>(`${env.YOUTUBE_API_BASE_URL}/videos`, {
            params: {
                part: uniqueParts.join(","),
                id: videoId,
                key: env.YOUTUBE_API_KEY
            }
        });

        const item = response.data.items[0];

        if (!item) {
            throw new Error(`Video ${videoId} was not found on YouTube`);
        }

        const result: YouTubeApiVideoPartsResult = {};

        if (uniqueParts.includes(VideoSection.Snippet)) {
            result.snippet = {
                title: item.snippet?.title ?? null,
                description: item.snippet?.description ?? null,
                publishedAt: item.snippet?.publishedAt ?? null,
                channelId: item.snippet?.channelId ?? null,
                channelTitle: item.snippet?.channelTitle ?? null
            };
            result.extra = {
                tags: item.snippet?.tags ?? [],
                categoryId: item.snippet?.categoryId ?? null,
                defaultLanguage: item.snippet?.defaultLanguage ?? null
            };
        }

        if (uniqueParts.includes(VideoSection.Statistics)) {
            result.statistics = {
                views: parseCount(item.statistics?.viewCount),
                likes: parseCount(item.statistics?.likeCount),
                comments: parseCount(item.statistics?.commentCount),
                favorites: parseCount(item.statistics?.favoriteCount)
            };
        }

        if (uniqueParts.includes(VideoSection.ContentDetails)) {
            result.contentDetails = {
                duration: item.contentDetails?.duration ?? null,
                definition: item.contentDetails?.definition ?? null,
                caption: item.contentDetails?.caption ?? null,
                licensedContent: item.contentDetails?.licensedContent ?? null
            };
        }

        return result;
    }

    async fetchChannelMetadata(channelId: string): Promise<ChannelMetadata | null> {
        const response = await axios.get<YouTubeApiChannelsResponse>(`${env.YOUTUBE_API_BASE_URL}/channels`, {
            params: {
                part: "snippet,statistics",
                id: channelId,
                key: env.YOUTUBE_API_KEY
            }
        });

        const item = response.data.items[0];
        if (!item) {
            return null;
        }

        return {
            id: item.id,
            title: item.snippet?.title ?? null,
            description: item.snippet?.description ?? null,
            customUrl: item.snippet?.customUrl ?? null,
            thumbnail:
                item.snippet?.thumbnails?.high?.url ??
                item.snippet?.thumbnails?.medium?.url ??
                item.snippet?.thumbnails?.default?.url ??
                null,
            subscribers: parseCount(item.statistics?.subscriberCount),
            hiddenSubscriberCount: item.statistics?.hiddenSubscriberCount ?? null,
            totalVideos: parseCount(item.statistics?.videoCount),
            totalViews: parseCount(item.statistics?.viewCount)
        };
    }

    async fetchVideoMetadata(videoId: string): Promise<YouTubeApiVideoMetadata> {
        const parts = await this.fetchVideoParts(videoId, [
            VideoSection.Snippet,
            VideoSection.Statistics,
            VideoSection.ContentDetails
        ]);
        const channelId = parts.snippet?.channelId ?? null;
        const channel = channelId ? await this.fetchChannelMetadata(channelId) : null;

        return {
            videoId,
            url: canonicalYouTubeUrl(videoId),
            title: parts.snippet?.title ?? null,
            description: parts.snippet?.description ?? null,
            publishedAt: parts.snippet?.publishedAt ?? null,
            thumbnails: this.buildThumbnailSet(videoId),
            statistics: parts.statistics ?? {
                views: null,
                likes: null,
                comments: null,
                favorites: null
            },
            contentDetails: parts.contentDetails ?? {
                duration: null,
                definition: null,
                caption: null,
                licensedContent: null
            },
            extra: parts.extra ?? {
                tags: [],
                categoryId: null,
                defaultLanguage: null
            },
            channel
        };
    }
}

export const youTubeService = new YouTubeService();
