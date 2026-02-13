import { ChannelMetadata, VideoContentDetails, VideoExtra, VideoSnippet, VideoStatistics, VideoThumbnails } from "./video-metadata";

export interface YouTubeApiVideoMetadata {
    videoId: string;
    url: string;
    title: string | null;
    description: string | null;
    publishedAt: string | null;
    thumbnails: VideoThumbnails;
    statistics: VideoStatistics;
    contentDetails: VideoContentDetails;
    extra: VideoExtra;
    channel: ChannelMetadata | null;
}

export interface YouTubeApiVideoPartsResult {
    snippet?: VideoSnippet;
    statistics?: VideoStatistics;
    contentDetails?: VideoContentDetails;
    extra?: VideoExtra;
}
