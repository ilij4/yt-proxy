
// Used for the part parameter that specifies a comma-separated list 
// of one or more video resource properties that the API response will include
export enum VideoSection {
  Snippet = "snippet",
  Statistics = "statistics",
  ContentDetails = "contentDetails",
  Thumbnails = "thumbnails",
  Channel = "channel"
}

export const YOUTUBE_VIDEO_PARTS = [
  VideoSection.Snippet,
  VideoSection.Statistics,
  VideoSection.ContentDetails
] as const;

export type VideoPart = (typeof YOUTUBE_VIDEO_PARTS)[number];
