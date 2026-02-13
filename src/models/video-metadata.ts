import { Document, Model, Schema, model } from "mongoose";

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

export type VideoMetadataDocument = VideoMetadata & Document;

const videoMetadataSchema = new Schema<VideoMetadataDocument>(
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

videoMetadataSchema.set("toJSON", {
    versionKey: false,
    transform: (_, ret: { _id?: unknown; id?: string }) => {
        ret.id = String(ret._id);
        delete ret._id;
    }
});

export const VideoMetadataModel: Model<VideoMetadataDocument> = model<VideoMetadataDocument>(
    "VideoMetadata",
    videoMetadataSchema,
    "videometadatacaches"
);
