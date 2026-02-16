import { FastifyInstance } from "fastify";
import type { VideoWithMetadata } from "../models/video";
import type {
    CreateVideoResponse,
    ListVideosResponse,
    UpdateVideoResponse,
    VideoChannelResponse,
    VideoMetadataResponse,
    VideoStatsResponse,
    VideoThumbnailResponse
} from "./video-api-types";
import { videoController, type CreateVideoBody, type HashParams, type RefreshQuerystring } from "../controllers/video-controller";

const hashParamsSchema = {
    type: "object",
    required: ["hash"],
    properties: {
        hash: { type: "string" }
    }
} as const;

const refreshQuerySchema = {
    type: "object",
    properties: {
        refresh: {
            type: "string",
            description: "Set to true to force refresh from YouTube (for example: true, 1, yes)."
        }
    }
} as const;

export async function registerVideoRoutes(app: FastifyInstance): Promise<void> {
    app.post<{ Body: CreateVideoBody; Reply: CreateVideoResponse }>("/api/videos", {
        schema: {
            tags: ["Videos"],
            summary: "Create URL-hash mapping",
            body: {
                type: "object",
                required: ["url"],
                properties: {
                    url: { type: "string", format: "uri" },
                    hash: { type: "string", minLength: 3, maxLength: 128 },
                    userId: { type: "string", minLength: 1, maxLength: 128 }
                }
            }
        }
    }, videoController.createVideo);

    app.get<{ Reply: ListVideosResponse }>("/api/videos", {
        schema: {
            tags: ["Videos"],
            summary: "List stored videos with filtering and sorting",
            querystring: {
                type: "object",
                properties: {
                    userId: { type: "string" },
                    category: { type: "string" },
                    tags: { type: "string", description: "Comma separated tag list (from metadata.extra.tags)." },
                    tagsMode: { type: "string", enum: ["any", "all"] },
                    minElo: { type: "number" },
                    maxElo: { type: "number" },
                    sortBy: { type: "string", enum: ["elo", "created", "category", "updated"] },
                    sortOrder: { type: "string", enum: ["asc", "desc"] },
                    page: { type: "number", minimum: 1 },
                    limit: { type: "number", minimum: 1, maximum: 100 }
                }
            }
        }
    }, videoController.listVideos);

    app.get<{ Params: HashParams; Reply: VideoWithMetadata }>("/api/videos/:hash", {
        schema: {
            tags: ["Videos"],
            summary: "Get stored mapping by hash",
            params: hashParamsSchema
        }
    }, videoController.getVideo);

    app.patch<{ Params: HashParams; Body: { userId?: string | null; elo?: number; category?: string | null }; Reply: UpdateVideoResponse }>("/api/videos/:hash", {
        schema: {
            tags: ["Videos"],
            summary: "Update service-managed video fields (userId, elo, category)",
            params: hashParamsSchema,
            body: {
                type: "object",
                properties: {
                    userId: { type: ["string", "null"] },
                    elo: { type: "number" },
                    category: { type: ["string", "null"] }
                },
                additionalProperties: false
            }
        }
    }, videoController.updateVideo);

    app.get<{ Params: HashParams; Querystring: RefreshQuerystring; Reply: VideoMetadataResponse }>("/api/videos/:hash/metadata", {
        schema: {
            tags: ["Videos"],
            summary: "Get full video metadata",
            params: hashParamsSchema,
            querystring: refreshQuerySchema
        }
    }, videoController.getVideoMetadata);

    app.get<{ Params: HashParams; Querystring: RefreshQuerystring; Reply: VideoThumbnailResponse }>("/api/videos/:hash/thumbnail", {
        schema: {
            tags: ["Videos"],
            summary: "Get video thumbnail URLs",
            params: hashParamsSchema,
            querystring: refreshQuerySchema
        }
    }, videoController.getVideoThumbnail);

    app.get<{ Params: HashParams; Querystring: RefreshQuerystring; Reply: VideoStatsResponse }>("/api/videos/:hash/stats", {
        schema: {
            tags: ["Videos"],
            summary: "Get video statistics",
            params: hashParamsSchema,
            querystring: refreshQuerySchema
        }
    }, videoController.getVideoStats);

    app.get<{ Params: HashParams; Querystring: RefreshQuerystring; Reply: VideoChannelResponse }>("/api/videos/:hash/channel", {
        schema: {
            tags: ["Videos"],
            summary: "Get channel metadata for a video",
            params: hashParamsSchema,
            querystring: refreshQuerySchema
        }
    }, videoController.getVideoChannel);
}
