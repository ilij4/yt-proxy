import axios from "axios";
import { env } from "../config/env";
import { canonicalYouTubeUrl } from "../utils/youtube-url";

export type VideoPart = "snippet" | "statistics" | "contentDetails";

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

interface YouTubeVideoResponse {
  items: Array<{
    id: string;
    snippet?: {
      title?: string;
      description?: string;
      publishedAt?: string;
      channelId?: string;
      channelTitle?: string;
      tags?: string[];
      categoryId?: string;
      defaultLanguage?: string;
    };
    statistics?: {
      viewCount?: string;
      likeCount?: string;
      commentCount?: string;
      favoriteCount?: string;
    };
    contentDetails?: {
      duration?: string;
      definition?: string;
      caption?: string;
      licensedContent?: boolean;
    };
  }>;
}

interface YouTubeChannelResponse {
  items: Array<{
    id: string;
    snippet?: {
      title?: string;
      description?: string;
      customUrl?: string;
      thumbnails?: {
        default?: { url?: string };
        medium?: { url?: string };
        high?: { url?: string };
      };
    };
    statistics?: {
      subscriberCount?: string;
      videoCount?: string;
      viewCount?: string;
      hiddenSubscriberCount?: boolean;
    };
  }>;
}

export interface VideoMetadata {
  videoId: string;
  url: string;
  title: string | null;
  description: string | null;
  publishedAt: string | null;
  thumbnails: VideoThumbnails;
  statistics: VideoStatistics;
  contentDetails: VideoContentDetails;
  extra: VideoExtra;
  channel: ChannelMetadata | null;
}

function parseCount(value?: string): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildThumbnailSet(videoId: string): VideoThumbnails {
  const base = `https://i.ytimg.com/vi/${videoId}`;
  return {
    default: `${base}/default.jpg`,
    medium: `${base}/mqdefault.jpg`,
    high: `${base}/hqdefault.jpg`
  };
}

export interface VideoPartsResult {
  snippet?: VideoSnippet;
  statistics?: VideoStatistics;
  contentDetails?: VideoContentDetails;
  extra?: VideoExtra;
}

export async function fetchVideoParts(videoId: string, parts: VideoPart[]): Promise<VideoPartsResult> {
  if (parts.length === 0) {
    return {};
  }

  const uniqueParts = Array.from(new Set(parts));
  const response = await axios.get<YouTubeVideoResponse>(`${env.YOUTUBE_API_BASE_URL}/videos`, {
    params: {
      part: uniqueParts.join(","),
      id: videoId,
      key: env.YOUTUBE_API_KEY
    }
  });

  const item = response.data.items[0];

  if (!item) {
    throw new Error(`Video ${videoId} was not found on YouTube`);
  }

  const result: VideoPartsResult = {};

  if (uniqueParts.includes("snippet")) {
    result.snippet = {
      title: item.snippet?.title ?? null,
      description: item.snippet?.description ?? null,
      publishedAt: item.snippet?.publishedAt ?? null,
      channelId: item.snippet?.channelId ?? null,
      channelTitle: item.snippet?.channelTitle ?? null
    };
    result.extra = {
      tags: item.snippet?.tags ?? [],
      categoryId: item.snippet?.categoryId ?? null,
      defaultLanguage: item.snippet?.defaultLanguage ?? null
    };
  }

  if (uniqueParts.includes("statistics")) {
    result.statistics = {
      views: parseCount(item.statistics?.viewCount),
      likes: parseCount(item.statistics?.likeCount),
      comments: parseCount(item.statistics?.commentCount),
      favorites: parseCount(item.statistics?.favoriteCount)
    };
  }

  if (uniqueParts.includes("contentDetails")) {
    result.contentDetails = {
      duration: item.contentDetails?.duration ?? null,
      definition: item.contentDetails?.definition ?? null,
      caption: item.contentDetails?.caption ?? null,
      licensedContent: item.contentDetails?.licensedContent ?? null
    };
  }

  return result;
}

export async function fetchChannelMetadata(channelId: string): Promise<ChannelMetadata | null> {
  const response = await axios.get<YouTubeChannelResponse>(`${env.YOUTUBE_API_BASE_URL}/channels`, {
    params: {
      part: "snippet,statistics",
      id: channelId,
      key: env.YOUTUBE_API_KEY
    }
  });

  const item = response.data.items[0];
  if (!item) {
    return null;
  }

  return {
    id: item.id,
    title: item.snippet?.title ?? null,
    description: item.snippet?.description ?? null,
    customUrl: item.snippet?.customUrl ?? null,
    thumbnail:
      item.snippet?.thumbnails?.high?.url ??
      item.snippet?.thumbnails?.medium?.url ??
      item.snippet?.thumbnails?.default?.url ??
      null,
    subscribers: parseCount(item.statistics?.subscriberCount),
    hiddenSubscriberCount: item.statistics?.hiddenSubscriberCount ?? null,
    totalVideos: parseCount(item.statistics?.videoCount),
    totalViews: parseCount(item.statistics?.viewCount)
  };
}

export async function fetchVideoMetadata(videoId: string): Promise<VideoMetadata> {
  const parts = await fetchVideoParts(videoId, ["snippet", "statistics", "contentDetails"]);
  const channelId = parts.snippet?.channelId ?? null;
  const channel = channelId ? await fetchChannelMetadata(channelId) : null;

  return {
    videoId,
    url: canonicalYouTubeUrl(videoId),
    title: parts.snippet?.title ?? null,
    description: parts.snippet?.description ?? null,
    publishedAt: parts.snippet?.publishedAt ?? null,
    thumbnails: buildThumbnailSet(videoId),
    statistics: parts.statistics ?? {
      views: null,
      likes: null,
      comments: null,
      favorites: null
    },
    contentDetails: parts.contentDetails ?? {
      duration: null,
      definition: null,
      caption: null,
      licensedContent: null
    },
    extra: parts.extra ?? {
      tags: [],
      categoryId: null,
      defaultLanguage: null
    },
    channel
  };
}
