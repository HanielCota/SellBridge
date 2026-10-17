import { createServer, type Server } from "node:http";
import { type HealthCheck, runHealthChecks } from "@sellbridge/shared/health";
import { logger } from "@sellbridge/shared/logger";

/** GET /health for container probes: 503 when a critical check (worker, Redis) fails. */
export function startHealthServer(port: number, checks: readonly HealthCheck[]): Server {
  const server = createServer(async (request, response) => {
    if (request.url !== "/health") {
      response.writeHead(404).end();
      return;
    }
    const report = await runHealthChecks(checks);
    response.writeHead(report.httpStatus, { "content-type": "application/json" });
    response.end(JSON.stringify(report.body));
  });
  server.listen(port, () => logger.info("worker.health_listening", { port }));
  return server;
}
