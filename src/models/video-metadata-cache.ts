import { Document, Model, Schema, model } from "mongoose";

export interface VideoMetadataCache {
  videoId: string;
  snippet: Record<string, unknown> | null;
  extra: Record<string, unknown> | null;
  contentDetails: Record<string, unknown> | null;
  thumbnails: Record<string, unknown> | null;
  statistics: Record<string, unknown> | null;
  channel: Record<string, unknown> | null;
  snippetFetchedAt: Date | null;
  contentDetailsFetchedAt: Date | null;
  thumbnailsFetchedAt: Date | null;
  statisticsFetchedAt: Date | null;
  channelFetchedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type VideoMetadataCacheDocument = VideoMetadataCache & Document;

const videoMetadataCacheSchema = new Schema<VideoMetadataCacheDocument>(
  {
    videoId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true
    },
    snippet: {
      type: Schema.Types.Mixed,
      default: null
    },
    extra: {
      type: Schema.Types.Mixed,
      default: null
    },
    contentDetails: {
      type: Schema.Types.Mixed,
      default: null
    },
    thumbnails: {
      type: Schema.Types.Mixed,
      default: null
    },
    statistics: {
      type: Schema.Types.Mixed,
      default: null
    },
    channel: {
      type: Schema.Types.Mixed,
      default: null
    },
    snippetFetchedAt: {
      type: Date,
      default: null
    },
    contentDetailsFetchedAt: {
      type: Date,
      default: null
    },
    thumbnailsFetchedAt: {
      type: Date,
      default: null
    },
    statisticsFetchedAt: {
      type: Date,
      default: null
    },
    channelFetchedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

videoMetadataCacheSchema.set("toJSON", {
  versionKey: false,
  transform: (_, ret: { _id?: unknown; id?: string }) => {
    ret.id = String(ret._id);
    delete ret._id;
  }
});

export const VideoMetadataCacheModel: Model<VideoMetadataCacheDocument> = model<VideoMetadataCacheDocument>(
  "VideoMetadataCache",
  videoMetadataCacheSchema
);
