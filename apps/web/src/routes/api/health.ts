import { runHealthChecks } from "@sellbridge/shared/health";
import { createFileRoute } from "@tanstack/react-router";
import { sql } from "drizzle-orm";
import { database } from "@/lib/server/database";
import { pingRedis } from "@/lib/server/queues";

/**
 * Container probe: 503 only when Postgres is unreachable. Redis down leaves the app up as
 * "degraded" (publishing and syncs wait), since restarting the web container would not fix it.
 */
async function handleHealth(): Promise<Response> {
  const report = await runHealthChecks([
    {
      name: "database",
      critical: true,
      run: async () => {
        await database.execute(sql`select 1`);
        return true;
      },
    },
    { name: "redis", critical: false, run: pingRedis },
  ]);
  return Response.json(report.body, { status: report.httpStatus });
}

export const Route = createFileRoute("/api/health")({
  server: { handlers: { GET: handleHealth } },
});
