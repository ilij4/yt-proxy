import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  YOUTUBE_API_BASE_URL: z.string().url().default("https://www.googleapis.com/youtube/v3"),
  YOUTUBE_API_KEY: z.string().min(1, "YOUTUBE_API_KEY is required"),
  METADATA_REFRESH_ENABLED: z
    .preprocess(
      (value) => (typeof value === "string" ? value.toLowerCase() : value),
      z.enum(["true", "false"]).default("true")
    )
    .transform((value) => value === "true"),
  METADATA_REFRESH_INTERVAL_MS: z.coerce.number().int().positive().default(60000),
  METADATA_REFRESH_MAX_VIDEOS_PER_RUN: z.coerce.number().int().positive().default(200),
  METADATA_REFRESH_CONCURRENCY: z.coerce.number().int().positive().default(5)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const errors = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid environment variables: ${errors}`);
}

export const env = parsed.data;
