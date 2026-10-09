import { createServer, type Server } from "node:http";
import { logger } from "@sellbridge/shared/logger";

export function startHealthServer(port: number, isHealthy: () => boolean): Server {
  const server = createServer((request, response) => {
    if (request.url !== "/health") {
      response.writeHead(404).end();
      return;
    }
    const healthy = isHealthy();
    response.writeHead(healthy ? 200 : 503, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: healthy ? "ok" : "unavailable" }));
  });
  server.listen(port, () => logger.info("worker.health_listening", { port }));
  return server;
}
