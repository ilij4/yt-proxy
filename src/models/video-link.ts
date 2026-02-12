import { Document, Model, Schema, model } from "mongoose";

export interface VideoLink {
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

export type VideoLinkDocument = VideoLink & Document;

const videoLinkSchema = new Schema<VideoLinkDocument>(
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

videoLinkSchema.set("toJSON", {
  versionKey: false,
  transform: (_, ret: { _id?: unknown; id?: string }) => {
    ret.id = String(ret._id);
    delete ret._id;
  }
});

export const VideoLinkModel: Model<VideoLinkDocument> = model<VideoLinkDocument>("VideoLink", videoLinkSchema);
