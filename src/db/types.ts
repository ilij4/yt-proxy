import type { Generated, Insertable, Selectable, Updateable } from "kysely";
import type {
  ChannelMetadata,
  VideoContentDetails,
  VideoExtra,
  VideoSnippet,
  VideoStatistics,
  VideoThumbnails
} from "../models/video-metadata";

export interface VideosTable {
  id: Generated<number>;
  url: string;
  hash: string;
  video_id: string;
  user_id: string | null;
  elo: number | null;
  category: string | null;
  last_requested_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface VideoSnippetsTable {
  id: Generated<number>;
  video_id: string;
  data: VideoSnippet | null;
  fetched_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface VideoExtrasTable {
  id: Generated<number>;
  video_id: string;
  data: VideoExtra | null;
  fetched_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface VideoContentDetailsTable {
  id: Generated<number>;
  video_id: string;
  data: VideoContentDetails | null;
  fetched_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface VideoThumbnailsTable {
  id: Generated<number>;
  video_id: string;
  data: VideoThumbnails | null;
  fetched_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface VideoStatisticsTable {
  id: Generated<number>;
  video_id: string;
  data: VideoStatistics | null;
  fetched_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ChannelMetadataTable {
  id: Generated<number>;
  video_id: string;
  data: ChannelMetadata | null;
  fetched_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Database {
  videos: VideosTable;
  video_snippets: VideoSnippetsTable;
  video_extras: VideoExtrasTable;
  video_content_details: VideoContentDetailsTable;
  video_thumbnails: VideoThumbnailsTable;
  video_statistics: VideoStatisticsTable;
  channel_metadata: ChannelMetadataTable;
}

export type VideoRow = Selectable<VideosTable>;
export type NewVideoRow = Insertable<VideosTable>;
export type UpdateVideoRow = Updateable<VideosTable>;

export type VideoSnippetRow = Selectable<VideoSnippetsTable>;
export type NewVideoSnippetRow = Insertable<VideoSnippetsTable>;
export type UpdateVideoSnippetRow = Updateable<VideoSnippetsTable>;

export type VideoExtraRow = Selectable<VideoExtrasTable>;
export type NewVideoExtraRow = Insertable<VideoExtrasTable>;
export type UpdateVideoExtraRow = Updateable<VideoExtrasTable>;

export type VideoContentDetailsRow = Selectable<VideoContentDetailsTable>;
export type NewVideoContentDetailsRow = Insertable<VideoContentDetailsTable>;
export type UpdateVideoContentDetailsRow = Updateable<VideoContentDetailsTable>;

export type VideoThumbnailsRow = Selectable<VideoThumbnailsTable>;
export type NewVideoThumbnailsRow = Insertable<VideoThumbnailsTable>;
export type UpdateVideoThumbnailsRow = Updateable<VideoThumbnailsTable>;

export type VideoStatisticsRow = Selectable<VideoStatisticsTable>;
export type NewVideoStatisticsRow = Insertable<VideoStatisticsTable>;
export type UpdateVideoStatisticsRow = Updateable<VideoStatisticsTable>;

export type ChannelMetadataRow = Selectable<ChannelMetadataTable>;
export type NewChannelMetadataRow = Insertable<ChannelMetadataTable>;
export type UpdateChannelMetadataRow = Updateable<ChannelMetadataTable>;
