import pino, { LoggerOptions } from "pino";
import { env } from "../config/env";

const options: LoggerOptions = {
  name: "yt-proxy",
  level: env.LOG_LEVEL,
  hooks: {
    logMethod(args, method) {
      // Fastify emits one "Server listening at ..." per interface.
      // Suppress those noisy lines and keep a single explicit startup log.
      if (typeof args[0] === "string" && args[0].startsWith("Server listening at")) {
        return;
      }

      method.apply(this, args);
    }
  }
};

if (env.NODE_ENV !== "production") {
  try {
    require.resolve("pino-pretty");
    options.transport = {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
        singleLine: true,
        levelFirst: true
      }
    };
  } catch {
    // Fallback to JSON logs if pino-pretty is not installed yet.
  }
}

export const logger = pino(options);

export function createLogger(scope: string) {
  return logger.child({ scope });
}
