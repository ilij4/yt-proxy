import { sql, type SqlBool } from "kysely";
import { ApiError } from "../errors/api-error";
import { toVideo } from "../db/mappers";
import { db } from "../db/postgres";
import type { UpdateVideoRow, VideoRow } from "../db/types";
import type { Video, VideoMetadataSnapshot, VideoWithMetadata } from "../models/video";
import type {
  ChannelMetadata,
  VideoContentDetails,
  VideoExtra,
  VideoSnippet,
  VideoStatistics,
  VideoThumbnails
} from "../models/video-metadata";
import { getCachedVideoMetadata } from "./video-metadata-cache";

export interface CreateVideoRecordInput {
  url: string;
  hash: string;
  videoId: string;
  userId?: string | null;
}

export interface ListVideosQuery {
  userId?: string;
  category?: string;
  tags?: string;
  tagsMode: "any" | "all";
  minElo?: number;
  maxElo?: number;
  sortBy: "elo" | "created" | "category" | "updated";
  sortOrder: "asc" | "desc";
  page: number;
  limit: number;
}

interface VideoWithMetadataRow extends VideoRow {
  snippet_data: VideoSnippet | null;
  snippet_fetched_at: Date | null;
  extra_data: VideoExtra | null;
  extra_fetched_at: Date | null;
  content_details_data: VideoContentDetails | null;
  content_details_fetched_at: Date | null;
  thumbnails_data: VideoThumbnails | null;
  thumbnails_fetched_at: Date | null;
  statistics_data: VideoStatistics | null;
  statistics_fetched_at: Date | null;
  channel_data: ChannelMetadata | null;
  channel_fetched_at: Date | null;
}

function toMetadataSnapshot(row: VideoWithMetadataRow): VideoMetadataSnapshot {
  return {
    snippet: row.snippet_data ?? null,
    extra: row.extra_data ?? null,
    contentDetails: row.content_details_data ?? null,
    thumbnails: row.thumbnails_data ?? null,
    statistics: row.statistics_data ?? null,
    channel: row.channel_data ?? null,
    snippetFetchedAt: row.snippet_fetched_at ?? null,
    extraFetchedAt: row.extra_fetched_at ?? null,
    contentDetailsFetchedAt: row.content_details_fetched_at ?? null,
    thumbnailsFetchedAt: row.thumbnails_fetched_at ?? null,
    statisticsFetchedAt: row.statistics_fetched_at ?? null,
    channelFetchedAt: row.channel_fetched_at ?? null
  };
}

function toVideoWithMetadata(row: VideoWithMetadataRow): VideoWithMetadata {
  return {
    ...toVideo(row),
    metadata: toMetadataSnapshot(row)
  };
}

function baseVideoWithMetadataQuery() {
  return db
    .selectFrom("videos as v")
    .leftJoin("video_snippets as vs", "vs.video_id", "v.video_id")
    .leftJoin("video_extras as ve", "ve.video_id", "v.video_id")
    .leftJoin("video_content_details as vcd", "vcd.video_id", "v.video_id")
    .leftJoin("video_thumbnails as vt", "vt.video_id", "v.video_id")
    .leftJoin("video_statistics as vstat", "vstat.video_id", "v.video_id")
    .leftJoin("channel_metadata as cm", "cm.video_id", "v.video_id");
}

function selectVideoWithMetadataFields(query: ReturnType<typeof baseVideoWithMetadataQuery>) {
  return query
    .selectAll("v")
    .select([
      sql<VideoSnippet | null>`vs.data`.as("snippet_data"),
      sql<Date | null>`vs.fetched_at`.as("snippet_fetched_at"),
      sql<VideoExtra | null>`ve.data`.as("extra_data"),
      sql<Date | null>`ve.fetched_at`.as("extra_fetched_at"),
      sql<VideoContentDetails | null>`vcd.data`.as("content_details_data"),
      sql<Date | null>`vcd.fetched_at`.as("content_details_fetched_at"),
      sql<VideoThumbnails | null>`vt.data`.as("thumbnails_data"),
      sql<Date | null>`vt.fetched_at`.as("thumbnails_fetched_at"),
      sql<VideoStatistics | null>`vstat.data`.as("statistics_data"),
      sql<Date | null>`vstat.fetched_at`.as("statistics_fetched_at"),
      sql<ChannelMetadata | null>`cm.data`.as("channel_data"),
      sql<Date | null>`cm.fetched_at`.as("channel_fetched_at")
    ]);
}

export class VideoService {
  async getVideoByHash(hash: string): Promise<Video> {
    const video = await db
      .selectFrom("videos")
      .selectAll()
      .where("hash", "=", hash)
      .executeTakeFirst();
    if (!video) {
      throw new ApiError(404, "Hash not found");
    }
    return toVideo(video);
  }

  async getVideoWithMetadataByHash(hash: string): Promise<VideoWithMetadata> {
    const row = await selectVideoWithMetadataFields(baseVideoWithMetadataQuery())
      .where("v.hash", "=", hash)
      .executeTakeFirst();

    if (!row) {
      throw new ApiError(404, "Hash not found");
    }

    return toVideoWithMetadata(row as VideoWithMetadataRow);
  }

  async touchVideoAccess(videoId: string): Promise<void> {
    await db
      .updateTable("videos")
      .set({ last_requested_at: new Date() })
      .where("video_id", "=", videoId)
      .execute();
  }

  async createVideoRecord(
    input: CreateVideoRecordInput
  ): Promise<{ created: boolean; data: Video }> {
    const [existingByHash, existingByUrl, existingByVideoId] = await Promise.all([
      db.selectFrom("videos").selectAll().where("hash", "=", input.hash).executeTakeFirst(),
      db.selectFrom("videos").selectAll().where("url", "=", input.url).executeTakeFirst(),
      db.selectFrom("videos").selectAll().where("video_id", "=", input.videoId).executeTakeFirst()
    ]);

    if (existingByHash && existingByHash.url !== input.url) {
      throw new ApiError(409, "Hash is already linked to another URL");
    }

    if (input.userId && existingByHash?.user_id && existingByHash.user_id !== input.userId) {
      throw new ApiError(409, "Hash is already linked to another userId");
    }

    if (existingByUrl && existingByUrl.hash !== input.hash) {
      throw new ApiError(409, "URL is already linked to a different hash");
    }

    if (input.userId && existingByUrl?.user_id && existingByUrl.user_id !== input.userId) {
      throw new ApiError(409, "URL is already linked to another userId");
    }

    if (existingByVideoId && existingByVideoId.hash !== input.hash) {
      throw new ApiError(409, "Video ID is already linked to a different hash");
    }

    if (input.userId && existingByVideoId?.user_id && existingByVideoId.user_id !== input.userId) {
      throw new ApiError(409, "Video ID is already linked to another userId");
    }

    if (existingByHash || existingByUrl || existingByVideoId) {
      const record = (existingByHash ?? existingByUrl ?? existingByVideoId)!;
      if (input.userId && !record.user_id) {
        const updated = await db
          .updateTable("videos")
          .set({ user_id: input.userId })
          .where("id", "=", record.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        return {
          created: false,
          data: toVideo(updated)
        };
      }
      await getCachedVideoMetadata(record.video_id, false);
      return {
        created: false,
        data: toVideo(record)
      };
    }

    const created = await db
      .insertInto("videos")
      .values({
        url: input.url,
        hash: input.hash,
        video_id: input.videoId,
        user_id: input.userId ?? null
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await getCachedVideoMetadata(created.video_id, false);
    return {
      created: true,
      data: toVideo(created)
    };
  }

  async listVideos(
    query: ListVideosQuery
  ): Promise<{ items: VideoWithMetadata[]; total: number }> {
    let baseQuery = baseVideoWithMetadataQuery();

    if (query.userId) {
      baseQuery = baseQuery.where("v.user_id", "=", query.userId);
    }

    if (query.category) {
      baseQuery = baseQuery.where("v.category", "=", query.category);
    }

    if (query.minElo !== undefined) {
      baseQuery = baseQuery.where("v.elo", ">=", query.minElo);
    }

    if (query.maxElo !== undefined) {
      baseQuery = baseQuery.where("v.elo", "<=", query.maxElo);
    }

    const sortFieldMap: Record<ListVideosQuery["sortBy"], ReturnType<typeof sql.ref>> = {
      elo: sql.ref("v.elo"),
      created: sql.ref("v.created_at"),
      category: sql.ref("v.category"),
      updated: sql.ref("v.updated_at")
    };

    const sortField = sortFieldMap[query.sortBy];
    const skip = (query.page - 1) * query.limit;
    const tags = query.tags
      ? Array.from(new Set(query.tags.split(",").map((tag) => tag.trim()).filter(Boolean)))
      : [];

    if (tags.length === 0) {
      const [list, countResult] = await Promise.all([
        selectVideoWithMetadataFields(baseQuery)
          .orderBy(sortField, query.sortOrder)
          .offset(skip)
          .limit(query.limit)
          .execute(),
        baseQuery
          .select((eb) => eb.fn.countAll().as("count"))
          .executeTakeFirst()
      ]);

      return {
        items: (list as VideoWithMetadataRow[]).map((row) => toVideoWithMetadata(row)),
        total: Number(countResult?.count ?? 0)
      };
    }

    const tagsArray = sql`ARRAY[${sql.join(tags)}]`;
    const tagsExpression = sql`coalesce(${sql.ref("ve.data")}->'tags', '[]'::jsonb)`;
    const tagsCondition =
      query.tagsMode === "all"
        ? sql<SqlBool>`${tagsExpression} ?& ${tagsArray}`
        : sql<SqlBool>`${tagsExpression} ?| ${tagsArray}`;

    const tagsQuery = baseQuery.where(tagsCondition);

    const [list, countResult] = await Promise.all([
      selectVideoWithMetadataFields(tagsQuery)
        .orderBy(sortField, query.sortOrder)
        .offset(skip)
        .limit(query.limit)
        .execute(),
      tagsQuery
        .select((eb) => eb.fn.countAll().as("count"))
        .executeTakeFirst()
    ]);

    return {
      items: (list as VideoWithMetadataRow[]).map((row) => toVideoWithMetadata(row)),
      total: Number(countResult?.count ?? 0)
    };
  }

  async updateVideoByHash(
    hash: string,
    update: { userId?: string | null; elo?: number; category?: string | null }
  ): Promise<Video> {
    const payload: UpdateVideoRow = {};

    if ("userId" in update) {
      payload.user_id = update.userId ?? null;
    }
    if ("elo" in update) {
      payload.elo = update.elo;
    }
    if ("category" in update) {
      payload.category = update.category ?? null;
    }

    const video = await db
      .updateTable("videos")
      .set(payload)
      .where("hash", "=", hash)
      .returningAll()
      .executeTakeFirst();

    if (!video) {
      throw new ApiError(404, "Hash not found");
    }

    return toVideo(video);
  }
}

export const videoService = new VideoService();
