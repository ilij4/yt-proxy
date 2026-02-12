import fastify from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { ZodError } from "zod";
import { ApiError } from "./errors/api-error";
import { registerVideoRoutes } from "./routes/video-routes";
import { logger } from "./utils/logger";

export const app = fastify({
  loggerInstance: logger
});

app.register(swagger, {
  openapi: {
    info: {
      title: "YouTube Proxy API",
      version: "1.0.0",
      description: "Store YouTube URLs + hashes and fetch YouTube metadata"
    }
  }
});

app.register(swaggerUi, {
  routePrefix: "/docs",
  staticCSP: true,
  uiConfig: {
    docExpansion: "list",
    deepLinking: false
  }
});

app.get("/api/health", {
  schema: {
    tags: ["Health"],
    summary: "Health check"
  }
}, async () => {
  return { status: "ok" };
});

app.register(async (instance) => {
  await registerVideoRoutes(instance);
});

app.setErrorHandler((err, request, reply) => {
  if (err instanceof ApiError) {
    request.log.warn({ err }, "Handled API error");
    return reply.status(err.statusCode).send({
      error: err.message
    });
  }

  if (err instanceof ZodError) {
    request.log.warn({ err }, "Invalid request payload");
    return reply.status(400).send({
      error: "Invalid request payload",
      details: err.issues
    });
  }

  if (err instanceof Error) {
    request.log.error({ err }, "Unhandled server error");
    return reply.status(500).send({
      error: err.message
    });
  }

  request.log.error({ err }, "Unknown server error");
  return reply.status(500).send({
    error: "Unknown server error"
  });
});
