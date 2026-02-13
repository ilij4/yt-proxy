import type { VideoDocument } from "../models/video";
import { VideoThumbnails, VideoStatistics, ChannelMetadata } from "../models/video-metadata";
import type {
    YouTubeApiVideoMetadata,
} from "../models/youtube-api-types";

export type VideoSortBy = "elo" | "created" | "category" | "updated";
export type VideoSortOrder = "asc" | "desc";

export interface CreateVideoResponse {
    created: boolean;
    data: VideoDocument;
}

export interface UpdateVideoResponse {
    updated: boolean;
    data: VideoDocument;
}

export interface ListVideosResponse {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    sortBy: VideoSortBy;
    sortOrder: VideoSortOrder;
    items: unknown[];
}

export interface VideoMetadataResponse {
    hash: string;
    url: string;
    metadata: YouTubeApiVideoMetadata;
}

export interface VideoThumbnailResponse {
    hash: string;
    url: string;
    thumbnail: VideoThumbnails;
}

export interface VideoStatsResponse {
    hash: string;
    url: string;
    statistics: VideoStatistics;
}

export interface VideoChannelResponse {
    hash: string;
    url: string;
    channel: ChannelMetadata | null;
}
