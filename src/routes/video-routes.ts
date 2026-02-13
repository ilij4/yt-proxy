import { FastifyInstance } from "fastify";
import { FilterQuery, SortOrder } from "mongoose";
import { z } from "zod";
import { ApiError } from "../errors/api-error";
import { VideoMetadataModel } from "../models/video-metadata";
import { VideoDocument, VideoModel } from "../models/video";
import type {
    CreateVideoResponse,
    ListVideosResponse,
    UpdateVideoResponse,
    VideoChannelResponse,
    VideoMetadataResponse,
    VideoStatsResponse,
    VideoThumbnailResponse
} from "./video-api-types";
import {
    getCachedVideoChannel,
    getCachedVideoMetadata,
    getCachedVideoStatistics,
    getCachedVideoThumbnails
} from "../services/video-metadata-cache";
import { sha256 } from "../utils/hash";
import { canonicalYouTubeUrl, extractYouTubeVideoId } from "../utils/youtube-url";

const createVideoSchema = z.object({
    url: z.string().url(),
    hash: z.string().trim().min(3).max(128).optional(),
    userId: z.string().trim().min(1).max(128).optional()
});

const updateVideoSchema = z
    .object({
        userId: z.string().trim().min(1).max(128).nullable().optional(),
        elo: z.number().finite().optional(),
        category: z.string().trim().min(1).max(128).nullable().optional()
    })
    .refine((payload) => Object.keys(payload).length > 0, "At least one field must be provided");

const listVideosQuerySchema = z
    .object({
        userId: z.string().trim().min(1).optional(),
        category: z.string().trim().min(1).optional(),
        tags: z.string().trim().min(1).optional(),
        tagsMode: z.enum(["any", "all"]).default("any"),
        minElo: z.coerce.number().optional(),
        maxElo: z.coerce.number().optional(),
        sortBy: z.enum(["elo", "created", "category", "updated"]).default("created"),
        sortOrder: z.enum(["asc", "desc"]).default("desc"),
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20)
    })
    .refine((query) => {
        if (query.minElo !== undefined && query.maxElo !== undefined) {
            return query.minElo <= query.maxElo;
        }
        return true;
    }, "minElo must be less than or equal to maxElo");

async function getVideoByHash(hash: string) {
    const video = await VideoModel.findOne({ hash });
    if (!video) {
        throw new ApiError(404, "Hash not found");
    }
    return video;
}

async function touchVideoAccess(videoId: string): Promise<void> {
    await VideoModel.updateOne(
        { videoId },
        { $set: { lastRequestedAt: new Date() } }
    );
}

interface CreateVideoBody {
    url: string;
    hash?: string;
    userId?: string;
}

interface HashParams {
    hash: string;
}

interface RefreshQuerystring {
    refresh?: string;
}

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

function shouldForceRefresh(value?: string): boolean {
    if (!value) {
        return false;
    }
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "y";
}

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
    }, async (request, reply) => {
        const payload = createVideoSchema.parse(request.body);
        const videoId = extractYouTubeVideoId(payload.url);

        if (!videoId) {
            throw new ApiError(400, "Provided URL is not a valid YouTube video URL");
        }

        const normalizedUrl = canonicalYouTubeUrl(videoId);
        const hash = payload.hash ?? sha256(normalizedUrl);

        const [existingByHash, existingByUrl, existingByVideoId] = await Promise.all([
            VideoModel.findOne({ hash }),
            VideoModel.findOne({ url: normalizedUrl }),
            VideoModel.findOne({ videoId })
        ]);

        if (existingByHash && existingByHash.url !== normalizedUrl) {
            throw new ApiError(409, "Hash is already linked to another URL");
        }

        if (payload.userId && existingByHash?.userId && existingByHash.userId !== payload.userId) {
            throw new ApiError(409, "Hash is already linked to another userId");
        }

        if (existingByUrl && existingByUrl.hash !== hash) {
            throw new ApiError(409, "URL is already linked to a different hash");
        }

        if (payload.userId && existingByUrl?.userId && existingByUrl.userId !== payload.userId) {
            throw new ApiError(409, "URL is already linked to another userId");
        }

        if (existingByVideoId && existingByVideoId.hash !== hash) {
            throw new ApiError(409, "Video ID is already linked to a different hash");
        }

        if (payload.userId && existingByVideoId?.userId && existingByVideoId.userId !== payload.userId) {
            throw new ApiError(409, "Video ID is already linked to another userId");
        }

        if (existingByHash || existingByUrl || existingByVideoId) {
            const record = (existingByHash ?? existingByUrl ?? existingByVideoId)!;
            if (payload.userId && !record.userId) {
                record.userId = payload.userId;
                await record.save();
            }
            return reply.code(200).send({
                created: false,
                data: record
            });
        }

        const created = await VideoModel.create({
            url: normalizedUrl,
            hash,
            videoId,
            userId: payload.userId ?? null
        });

        return reply.code(201).send({
            created: true,
            data: created
        });
    });

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
    }, async (request) => {
        const query = listVideosQuerySchema.parse(request.query);
        const filter: FilterQuery<VideoDocument> = {};

        if (query.userId) {
            filter.userId = query.userId;
        }

        if (query.category) {
            filter.category = query.category;
        }

        if (query.minElo !== undefined || query.maxElo !== undefined) {
            const eloFilter: Record<string, number> = {};
            if (query.minElo !== undefined) {
                eloFilter.$gte = query.minElo;
            }
            if (query.maxElo !== undefined) {
                eloFilter.$lte = query.maxElo;
            }
            filter.elo = eloFilter;
        }

        const sortFieldMap: Record<typeof query.sortBy, string> = {
            elo: "elo",
            created: "createdAt",
            category: "category",
            updated: "updatedAt"
        };

        const sortField = sortFieldMap[query.sortBy];
        const sortOrder: SortOrder = query.sortOrder === "asc" ? 1 : -1;
        const skip = (query.page - 1) * query.limit;
        const tags = query.tags
            ? Array.from(new Set(query.tags.split(",").map((tag) => tag.trim()).filter(Boolean)))
            : [];

        let items: unknown[] = [];
        let total = 0;

        if (tags.length === 0) {
            const [list, count] = await Promise.all([
                VideoModel.find(filter).sort({ [sortField]: sortOrder }).skip(skip).limit(query.limit),
                VideoModel.countDocuments(filter)
            ]);
            items = list;
            total = count;
        } else {
            const metadataCollectionName = VideoMetadataModel.collection.name;
            const tagsMatch =
                query.tagsMode === "all"
                    ? { "metadataCache.extra.tags": { $all: tags } }
                    : { "metadataCache.extra.tags": { $in: tags } };

            const [list, countResult] = await Promise.all([
                VideoModel.aggregate([
                    { $match: filter },
                    {
                        $lookup: {
                            from: metadataCollectionName,
                            localField: "videoId",
                            foreignField: "videoId",
                            as: "metadataCache"
                        }
                    },
                    { $unwind: { path: "$metadataCache", preserveNullAndEmptyArrays: false } },
                    { $match: tagsMatch },
                    { $project: { metadataCache: 0 } },
                    { $sort: { [sortField]: sortOrder } },
                    { $skip: skip },
                    { $limit: query.limit }
                ]),
                VideoModel.aggregate([
                    { $match: filter },
                    {
                        $lookup: {
                            from: metadataCollectionName,
                            localField: "videoId",
                            foreignField: "videoId",
                            as: "metadataCache"
                        }
                    },
                    { $unwind: { path: "$metadataCache", preserveNullAndEmptyArrays: false } },
                    { $match: tagsMatch },
                    { $count: "count" }
                ])
            ]);

            items = list;
            total = countResult[0]?.count ?? 0;
        }

        return {
            page: query.page,
            limit: query.limit,
            total,
            totalPages: Math.ceil(total / query.limit),
            sortBy: query.sortBy,
            sortOrder: query.sortOrder,
            items
        };
    });

    app.get<{ Params: HashParams; Reply: VideoDocument }>("/api/videos/:hash", {
        schema: {
            tags: ["Videos"],
            summary: "Get stored mapping by hash",
            params: hashParamsSchema
        }
    }, async (request) => {
        const video = await getVideoByHash(request.params.hash);
        return video;
    });

    app.patch<{ Params: HashParams; Reply: UpdateVideoResponse }>("/api/videos/:hash", {
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
    }, async (request) => {
        const payload = updateVideoSchema.parse(request.body);
        const update: Partial<Pick<VideoDocument, "userId" | "elo" | "category">> = {};

        if ("userId" in payload) {
            update.userId = payload.userId;
        }
        if ("elo" in payload) {
            update.elo = payload.elo;
        }
        if ("category" in payload) {
            update.category = payload.category;
        }

        const video = await VideoModel.findOneAndUpdate(
            { hash: request.params.hash },
            { $set: update },
            { new: true, runValidators: true }
        );

        if (!video) {
            throw new ApiError(404, "Hash not found");
        }

        return {
            updated: true,
            data: video
        };
    });

    app.get<{ Params: HashParams; Querystring: RefreshQuerystring; Reply: VideoMetadataResponse }>("/api/videos/:hash/metadata", {
        schema: {
            tags: ["Videos"],
            summary: "Get full video metadata",
            params: hashParamsSchema,
            querystring: refreshQuerySchema
        }
    }, async (request) => {
        const video = await getVideoByHash(request.params.hash);
        await touchVideoAccess(video.videoId);
        const metadata = await getCachedVideoMetadata(video.videoId, shouldForceRefresh(request.query.refresh));
        return {
            hash: video.hash,
            url: video.url,
            metadata
        };
    });

    app.get<{ Params: HashParams; Querystring: RefreshQuerystring; Reply: VideoThumbnailResponse }>("/api/videos/:hash/thumbnail", {
        schema: {
            tags: ["Videos"],
            summary: "Get video thumbnail URLs",
            params: hashParamsSchema,
            querystring: refreshQuerySchema
        }
    }, async (request) => {
        const video = await getVideoByHash(request.params.hash);
        await touchVideoAccess(video.videoId);
        const thumbnails = await getCachedVideoThumbnails(video.videoId, shouldForceRefresh(request.query.refresh));

        return {
            hash: video.hash,
            url: video.url,
            thumbnail: thumbnails
        };
    });

    app.get<{ Params: HashParams; Querystring: RefreshQuerystring; Reply: VideoStatsResponse }>("/api/videos/:hash/stats", {
        schema: {
            tags: ["Videos"],
            summary: "Get video statistics",
            params: hashParamsSchema,
            querystring: refreshQuerySchema
        }
    }, async (request) => {
        const video = await getVideoByHash(request.params.hash);
        await touchVideoAccess(video.videoId);
        const statistics = await getCachedVideoStatistics(video.videoId, shouldForceRefresh(request.query.refresh));

        return {
            hash: video.hash,
            url: video.url,
            statistics
        };
    });

    app.get<{ Params: HashParams; Querystring: RefreshQuerystring; Reply: VideoChannelResponse }>("/api/videos/:hash/channel", {
        schema: {
            tags: ["Videos"],
            summary: "Get channel metadata for a video",
            params: hashParamsSchema,
            querystring: refreshQuerySchema
        }
    }, async (request) => {
        const video = await getVideoByHash(request.params.hash);
        await touchVideoAccess(video.videoId);
        const channel = await getCachedVideoChannel(video.videoId, shouldForceRefresh(request.query.refresh));

        return {
            hash: video.hash,
            url: video.url,
            channel
        };
    });
}
