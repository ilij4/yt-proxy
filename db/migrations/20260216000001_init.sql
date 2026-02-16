-- migrate:up

CREATE TABLE videos (
  id BIGSERIAL PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  hash TEXT NOT NULL UNIQUE,
  video_id TEXT NOT NULL UNIQUE,
  user_id TEXT,
  elo INTEGER,
  category TEXT,
  last_requested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX videos_user_id_idx ON videos (user_id);
CREATE INDEX videos_elo_idx ON videos (elo);
CREATE INDEX videos_category_idx ON videos (category);
CREATE INDEX videos_last_requested_at_idx ON videos (last_requested_at);
CREATE INDEX videos_created_at_idx ON videos (created_at);
CREATE INDEX videos_updated_at_idx ON videos (updated_at);

CREATE TABLE video_snippets (
  id BIGSERIAL PRIMARY KEY,
  video_id TEXT NOT NULL UNIQUE REFERENCES videos(video_id) ON DELETE CASCADE,
  data JSONB,
  fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE video_extras (
  id BIGSERIAL PRIMARY KEY,
  video_id TEXT NOT NULL UNIQUE REFERENCES videos(video_id) ON DELETE CASCADE,
  data JSONB,
  fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE video_content_details (
  id BIGSERIAL PRIMARY KEY,
  video_id TEXT NOT NULL UNIQUE REFERENCES videos(video_id) ON DELETE CASCADE,
  data JSONB,
  fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE video_thumbnails (
  id BIGSERIAL PRIMARY KEY,
  video_id TEXT NOT NULL UNIQUE REFERENCES videos(video_id) ON DELETE CASCADE,
  data JSONB,
  fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE video_statistics (
  id BIGSERIAL PRIMARY KEY,
  video_id TEXT NOT NULL UNIQUE REFERENCES videos(video_id) ON DELETE CASCADE,
  data JSONB,
  fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE channel_metadata (
  id BIGSERIAL PRIMARY KEY,
  video_id TEXT NOT NULL UNIQUE REFERENCES videos(video_id) ON DELETE CASCADE,
  data JSONB,
  fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX video_statistics_fetched_at_idx ON video_statistics (fetched_at);
CREATE INDEX video_extras_tags_gin_idx ON video_extras USING GIN ((data->'tags'));

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER videos_set_updated_at
BEFORE UPDATE ON videos
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

CREATE TRIGGER video_snippets_set_updated_at
BEFORE UPDATE ON video_snippets
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

CREATE TRIGGER video_extras_set_updated_at
BEFORE UPDATE ON video_extras
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

CREATE TRIGGER video_content_details_set_updated_at
BEFORE UPDATE ON video_content_details
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

CREATE TRIGGER video_thumbnails_set_updated_at
BEFORE UPDATE ON video_thumbnails
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

CREATE TRIGGER video_statistics_set_updated_at
BEFORE UPDATE ON video_statistics
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

CREATE TRIGGER channel_metadata_set_updated_at
BEFORE UPDATE ON channel_metadata
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();

-- migrate:down

DROP TRIGGER IF EXISTS channel_metadata_set_updated_at ON channel_metadata;
DROP TRIGGER IF EXISTS video_statistics_set_updated_at ON video_statistics;
DROP TRIGGER IF EXISTS video_thumbnails_set_updated_at ON video_thumbnails;
DROP TRIGGER IF EXISTS video_content_details_set_updated_at ON video_content_details;
DROP TRIGGER IF EXISTS video_extras_set_updated_at ON video_extras;
DROP TRIGGER IF EXISTS video_snippets_set_updated_at ON video_snippets;
DROP TRIGGER IF EXISTS videos_set_updated_at ON videos;
DROP FUNCTION IF EXISTS set_updated_at;

DROP INDEX IF EXISTS video_extras_tags_gin_idx;
DROP INDEX IF EXISTS video_statistics_fetched_at_idx;

DROP TABLE IF EXISTS channel_metadata;
DROP TABLE IF EXISTS video_statistics;
DROP TABLE IF EXISTS video_thumbnails;
DROP TABLE IF EXISTS video_content_details;
DROP TABLE IF EXISTS video_extras;
DROP TABLE IF EXISTS video_snippets;

DROP INDEX IF EXISTS videos_updated_at_idx;
DROP INDEX IF EXISTS videos_created_at_idx;
DROP INDEX IF EXISTS videos_last_requested_at_idx;
DROP INDEX IF EXISTS videos_category_idx;
DROP INDEX IF EXISTS videos_elo_idx;
DROP INDEX IF EXISTS videos_user_id_idx;

DROP TABLE IF EXISTS videos;
