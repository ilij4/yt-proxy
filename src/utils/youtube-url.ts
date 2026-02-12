const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

function readPathSegment(pathname: string, index: number): string | null {
  const parts = pathname.split("/").filter(Boolean);
  return parts[index] ?? null;
}

function isYouTubeHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtube-nocookie.com" || host.endsWith(".youtube-nocookie.com");
}

export function extractYouTubeVideoId(rawUrl: string): string | null {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return null;
  }

  const host = parsedUrl.hostname.toLowerCase().replace(/^www\./, "");

  if (host === "youtu.be") {
    const candidate = readPathSegment(parsedUrl.pathname, 0);
    return candidate && VIDEO_ID_REGEX.test(candidate) ? candidate : null;
  }

  if (!isYouTubeHost(host)) {
    return null;
  }

  const watchId = parsedUrl.searchParams.get("v");
  if (watchId && VIDEO_ID_REGEX.test(watchId)) {
    return watchId;
  }

  const shortsId = readPathSegment(parsedUrl.pathname, 1);
  const firstSegment = readPathSegment(parsedUrl.pathname, 0);

  if ((firstSegment === "shorts" || firstSegment === "embed" || firstSegment === "live") && shortsId && VIDEO_ID_REGEX.test(shortsId)) {
    return shortsId;
  }

  return null;
}

export function canonicalYouTubeUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
