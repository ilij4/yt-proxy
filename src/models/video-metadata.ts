export interface VideoMetadata {
  videoId: string;
  snippet: VideoSnippet | null;
  extra: VideoExtra | null;
  contentDetails: VideoContentDetails | null;
  thumbnails: VideoThumbnails | null;
  statistics: VideoStatistics | null;
  channel: ChannelMetadata | null;
  snippetFetchedAt: Date | null;
  contentDetailsFetchedAt: Date | null;
  thumbnailsFetchedAt: Date | null;
  statisticsFetchedAt: Date | null;
  channelFetchedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VideoSnippet {
  title: string | null;
  description: string | null;
  publishedAt: string | null;
  channelId: string | null;
  channelTitle: string | null;
}

export interface VideoStatistics {
  views: number | null;
  likes: number | null;
  comments: number | null;
  favorites: number | null;
}

export interface VideoContentDetails {
  duration: string | null;
  definition: string | null;
  caption: string | null;
  licensedContent: boolean | null;
}

export interface VideoExtra {
  tags: string[];
  categoryId: string | null;
  defaultLanguage: string | null;
}

export interface VideoThumbnails {
  default: string;
  medium: string;
  high: string;
}

export interface ChannelMetadata {
  id: string;
  title: string | null;
  description: string | null;
  customUrl: string | null;
  thumbnail: string | null;
  subscribers: number | null;
  hiddenSubscriberCount: boolean | null;
  totalVideos: number | null;
  totalViews: number | null;
}
