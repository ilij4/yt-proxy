import { writeFile } from "node:fs/promises";
import { app } from "../app";
import { createLogger } from "../utils/logger";

const swaggerLogger = createLogger("swagger-init");

async function initSwagger() {
  await app.ready();

  const spec = app.swagger();
  await writeFile("openapi.json", JSON.stringify(spec, null, 2), "utf-8");

  swaggerLogger.info("Generated openapi.json");
  swaggerLogger.info("Run `npm run dev` and open http://localhost:3000/docs");

  await app.close();
}

initSwagger().catch((error) => {
  swaggerLogger.error({ err: error }, "Failed to initialize Swagger");
  process.exit(1);
});
