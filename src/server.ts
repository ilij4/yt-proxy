import { app } from "./app";
import { env } from "./config/env";
import { connectToDatabase } from "./db/mongoose";
import { createLogger } from "./utils/logger";

const serverLogger = createLogger("server");

async function start() {
  await connectToDatabase();

  const address = await app.listen({
    host: "0.0.0.0",
    port: env.PORT
  });

  serverLogger.info({ port: env.PORT, address }, "Server started");
}

start().catch((error) => {
  serverLogger.error({ err: error }, "Failed to start server");
  process.exit(1);
});
