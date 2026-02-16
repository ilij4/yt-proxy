import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { ApiError } from "../errors/api-error";
import type { VideoWithMetadata } from "../models/video";
import type {
  CreateVideoResponse,
  ListVideosResponse,
  UpdateVideoResponse,
  VideoChannelResponse,
  VideoMetadataResponse,
  VideoStatsResponse,
  VideoThumbnailResponse
} from "../routes/video-api-types";
import {
  getCachedVideoChannel,
  getCachedVideoMetadata,
  getCachedVideoStatistics,
  getCachedVideoThumbnails
} from "../services/video-metadata-cache";
import { videoService } from "../services/video-service";
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

export interface CreateVideoBody {
  url: string;
  hash?: string;
  userId?: string;
}

export interface HashParams {
  hash: string;
}

export interface RefreshQuerystring {
  refresh?: string;
}

type CreateVideoRequest = FastifyRequest<{ Body: CreateVideoBody }>;
type ListVideosRequest = FastifyRequest;
type HashRequest = FastifyRequest<{ Params: HashParams }>;
type UpdateVideoRequest = FastifyRequest<{ Params: HashParams; Body: { userId?: string | null; elo?: number; category?: string | null } }>;
type RefreshRequest = FastifyRequest<{ Params: HashParams; Querystring: RefreshQuerystring }>;

function shouldForceRefresh(value?: string): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "y";
}

async function createVideo(request: CreateVideoRequest, reply: FastifyReply): Promise<CreateVideoResponse> {
  const payload = createVideoSchema.parse(request.body);
  const videoId = extractYouTubeVideoId(payload.url);

  if (!videoId) {
    throw new ApiError(400, "Provided URL is not a valid YouTube video URL");
  }

  const normalizedUrl = canonicalYouTubeUrl(videoId);
  const hash = payload.hash ?? sha256(normalizedUrl);

  const result = await videoService.createVideoRecord({
    url: normalizedUrl,
    hash,
    videoId,
    userId: payload.userId ?? null
  });

  reply.code(result.created ? 201 : 200);
  return result;
}

async function listVideos(request: ListVideosRequest): Promise<ListVideosResponse> {
  const query = listVideosQuerySchema.parse(request.query);
  const { items, total } = await videoService.listVideos(query);

  return {
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.ceil(total / query.limit),
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    items
  };
}

async function getVideo(request: HashRequest): Promise<VideoWithMetadata> {
  const video = await videoService.getVideoWithMetadataByHash(request.params.hash);
  return video;
}

async function updateVideo(request: UpdateVideoRequest): Promise<UpdateVideoResponse> {
  const payload = updateVideoSchema.parse(request.body);
  const video = await videoService.updateVideoByHash(request.params.hash, payload);

  return {
    updated: true,
    data: video
  };
}

async function getVideoMetadata(request: RefreshRequest): Promise<VideoMetadataResponse> {
  const video = await videoService.getVideoByHash(request.params.hash);
  await videoService.touchVideoAccess(video.videoId);
  const metadata = await getCachedVideoMetadata(video.videoId, shouldForceRefresh(request.query.refresh));
  return {
    hash: video.hash,
    url: video.url,
    metadata
  };
}

async function getVideoThumbnail(request: RefreshRequest): Promise<VideoThumbnailResponse> {
  const video = await videoService.getVideoByHash(request.params.hash);
  await videoService.touchVideoAccess(video.videoId);
  const thumbnails = await getCachedVideoThumbnails(video.videoId, shouldForceRefresh(request.query.refresh));

  return {
    hash: video.hash,
    url: video.url,
    thumbnail: thumbnails
  };
}

async function getVideoStats(request: RefreshRequest): Promise<VideoStatsResponse> {
  const video = await videoService.getVideoByHash(request.params.hash);
  await videoService.touchVideoAccess(video.videoId);
  const statistics = await getCachedVideoStatistics(video.videoId, shouldForceRefresh(request.query.refresh));

  return {
    hash: video.hash,
    url: video.url,
    statistics
  };
}

async function getVideoChannel(request: RefreshRequest): Promise<VideoChannelResponse> {
  const video = await videoService.getVideoByHash(request.params.hash);
  await videoService.touchVideoAccess(video.videoId);
  const channel = await getCachedVideoChannel(video.videoId, shouldForceRefresh(request.query.refresh));

  return {
    hash: video.hash,
    url: video.url,
    channel
  };
}

export const videoController = {
  createVideo,
  listVideos,
  getVideo,
  updateVideo,
  getVideoMetadata,
  getVideoThumbnail,
  getVideoStats,
  getVideoChannel
};
