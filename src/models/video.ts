import { Document, Model, Schema, model } from "mongoose";

export interface Video {
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

export type VideoDocument = Video & Document;

const videoSchema = new Schema<VideoDocument>(
  {
    url: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    hash: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    videoId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    userId: {
      type: String,
      default: null,
      trim: true,
      index: true
    },
    elo: {
      type: Number,
      default: null,
      index: true
    },
    category: {
      type: String,
      default: null,
      trim: true,
      index: true
    },
    lastRequestedAt: {
      type: Date,
      default: null,
      index: true
    }
  },
  {
    timestamps: true
  }
);

videoSchema.set("toJSON", {
  versionKey: false,
  transform: (_, ret: { _id?: unknown; id?: string }) => {
    ret.id = String(ret._id);
    delete ret._id;
  }
});

export const VideoModel: Model<VideoDocument> = model<VideoDocument>("Video", videoSchema, "videolinks");
