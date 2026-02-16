import type { Video } from "../models/video";
import type { VideoRow } from "./types";

export function toVideo(row: VideoRow): Video {
  return {
    id: String(row.id),
    url: row.url,
    hash: row.hash,
    videoId: row.video_id,
    userId: row.user_id,
    elo: row.elo,
    category: row.category,
    lastRequestedAt: row.last_requested_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
