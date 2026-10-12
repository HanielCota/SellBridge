import { logger } from "@sellbridge/shared/logger";
import { createFileRoute } from "@tanstack/react-router";
import { sql } from "drizzle-orm";
import { database } from "@/lib/server/database";

/** Container probe: the app answers and reaches Postgres. */
async function handleHealth(): Promise<Response> {
  try {
    await database.execute(sql`select 1`);
    return Response.json({ status: "ok" });
  } catch (error) {
    logger.error("health.database_unreachable", { error });
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}

export const Route = createFileRoute("/api/health")({
  server: { handlers: { GET: handleHealth } },
});
