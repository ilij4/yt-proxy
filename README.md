# yt-proxy

YouTube proxy service built with Node.js + TypeScript + Fastify + MongoDB.

## Features

- `POST /api/videos` accepts a YouTube URL and optional hash.
- If hash is omitted, hash is generated as SHA-256 from normalized URL.
- URL, hash, and video ID are stored in MongoDB.
- Stored video records can also hold service-managed fields:
  - `userId` (video owner id)
  - `elo` (number)
  - `category` (string)
- Built-in scheduler refreshes changing metadata (views/likes/comments) on a schedule.
- Metadata is cached in MongoDB with section-specific refresh intervals.
- Endpoints for metadata retrieval:
  - Thumbnail
  - View/like/comment stats
  - Channel info
  - Full metadata payload (plus extra fields)

## Requirements

- Node.js 18+
- MongoDB
- YouTube Data API v3 key

## Development Mode

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.example .env
```

3. Start MongoDB (required):

Option A: local MongoDB service.

Option B: Docker Compose (Mongo only):

```bash
docker compose -f docker-compose.mongo.yml up -d
```

4. Fill values in `.env`:

- `MONGODB_URI`
- `YOUTUBE_API_BASE_URL` (optional, default `https://www.googleapis.com/youtube/v3`)
- `YOUTUBE_API_KEY`
- `LOG_LEVEL` (optional, default `info`)
- `METADATA_REFRESH_ENABLED` (optional, default `true`)
- `METADATA_REFRESH_INTERVAL_MS` (optional, default `60000`)
- `METADATA_REFRESH_MAX_VIDEOS_PER_RUN` (optional, default `200`)
- `METADATA_REFRESH_CONCURRENCY` (optional, default `5`)
- `PORT` (optional, defaults to `3000`)

For Mongo from `docker-compose.mongo.yml`, use:

- `MONGODB_URI=mongodb://localhost:27017/yt_proxy`

5. Run API in development:

```bash
npm run dev
```

6. Optional quick check:

```bash
curl http://localhost:3000/api/health
```

7. Open Swagger UI:

- `http://localhost:3000/docs`

8. Generate OpenAPI spec file (optional):

```bash
npm run swagger:init
```

This creates `openapi.json` in the project root.

9. Stop dev Mongo (if started with compose):

```bash
docker compose -f docker-compose.mongo.yml down
```

## Run with Docker Compose

1. Create an env file for Docker Compose:

```bash
cp .env.example .env
```

2. Set at least `YOUTUBE_API_KEY` in `.env` (other values can stay as defaults).

3. Start API + MongoDB:

```bash
docker compose up --build
```

4. Stop services:

```bash
docker compose down
```

## API

You can also inspect the full API in Swagger UI at `/docs`.

### Cache behavior

- Data is cached by `videoId` in MongoDB.
- TTL by section:
  - stats: `5 minutes`
  - channel: `20 minutes`
  - snippet/title/description/tags: `24 hours`
  - content details (duration/definition/caption): `24 hours`
  - thumbnails: `24 hours`
- Default mode: stale-while-revalidate.
  - if cache is missing: fetch now and store
  - if cache is expired: return stale cache and refresh in background
- Scheduler mode: API process automatically refreshes stats for hot videos in the background.
- Force fresh data by adding `?refresh=true` to metadata endpoints.

### 1) Create link

`POST /api/videos`

Body:

```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "hash": "optional-custom-hash",
  "userId": "owner-123"
}
```

If `hash` is omitted, it is generated as SHA-256 of normalized URL (`https://www.youtube.com/watch?v=<videoId>`).
Uniqueness is enforced for `videoId`, `url`, and `hash`.

### 2) Get stored mapping

`GET /api/videos/:hash`

### 3) Update service fields for a video

`PATCH /api/videos/:hash`

Body example:

```json
{
  "userId": "owner-123",
  "elo": 1234,
  "category": "music"
}
```

All fields are optional, but at least one must be provided.

### 4) List all stored videos with filters/sorting

`GET /api/videos`

Supported query params:
- `userId` (owner id)
- `category` (exact match)
- `tags` (comma-separated list, from cached `metadata.extra.tags`)
- `tagsMode=any|all` (default `any`)
- `minElo` / `maxElo`
- `sortBy=elo|created|category|updated`
- `sortOrder=asc|desc`
- `page` (default `1`)
- `limit` (default `20`, max `100`)

Example:

`GET /api/videos?userId=owner-123&category=music&tags=live,concert&tagsMode=all&minElo=1100&sortBy=elo&sortOrder=desc&page=1&limit=20`

### 5) Get all metadata

`GET /api/videos/:hash/metadata`

Includes:
- title, description, publish date
- thumbnails
- statistics (views, likes, comments, favorites)
- channel data
- extra fields (tags, category, duration, etc.)

Supports `?refresh=true`.

### 6) Get thumbnail only

`GET /api/videos/:hash/thumbnail`

Supports `?refresh=true`.

### 7) Get stats only

`GET /api/videos/:hash/stats`

Supports `?refresh=true`.

### 8) Get channel only

`GET /api/videos/:hash/channel`

Supports `?refresh=true`.

### 9) Health check

`GET /api/health`

## Scripts

- `npm run dev` - start with live reload
- `npm run build` - compile TypeScript
- `npm run start` - run compiled build
- `npm run check` - type-check only
- `npm run swagger:init` - generate `openapi.json` from registered routes
