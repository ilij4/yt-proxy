import type {
  ChannelMetadata,
  VideoContentDetails,
  VideoExtra,
  VideoSnippet,
  VideoStatistics,
  VideoThumbnails
} from "./video-metadata";

export interface Video {
  id: string;
  url: string;
  hash: string;
  videoId: string;
  userId: string | null;
  elo: number | null;
  category: string | null;
  lastRequestedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VideoMetadataSnapshot {
  snippet: VideoSnippet | null;
  extra: VideoExtra | null;
  contentDetails: VideoContentDetails | null;
  thumbnails: VideoThumbnails | null;
  statistics: VideoStatistics | null;
  channel: ChannelMetadata | null;
  snippetFetchedAt: Date | null;
  extraFetchedAt: Date | null;
  contentDetailsFetchedAt: Date | null;
  thumbnailsFetchedAt: Date | null;
  statisticsFetchedAt: Date | null;
  channelFetchedAt: Date | null;
}

export interface VideoWithMetadata extends Video {
  metadata: VideoMetadataSnapshot;
}
