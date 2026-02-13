import { app } from "./app";
import { env } from "./config/env";
import { connectToDatabase } from "./db/mongoose";
import { startMetadataRefreshScheduler, stopMetadataRefreshScheduler } from "./services/metadata-refresh-scheduler";
import { createLogger } from "./utils/logger";

const serverLogger = createLogger("server");
let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  serverLogger.info({ signal }, "Shutdown started");
  stopMetadataRefreshScheduler();

  try {
    await app.close();
    serverLogger.info("Shutdown complete");
    process.exit(0);
  } catch (error) {
    serverLogger.error({ err: error }, "Error during shutdown");
    process.exit(1);
  }
}

async function start() {
  await connectToDatabase();

  const address = await app.listen({
    host: "0.0.0.0",
    port: env.PORT
  });

  serverLogger.info({ port: env.PORT, address }, "Server started");
  startMetadataRefreshScheduler();

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

start().catch((error) => {
  serverLogger.error({ err: error }, "Failed to start server");
  process.exit(1);
});
