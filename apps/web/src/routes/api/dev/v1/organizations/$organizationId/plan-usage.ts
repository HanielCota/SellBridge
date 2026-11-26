import { createFileRoute } from "@tanstack/react-router";
import { developerRouteHandler } from "@/features/developer-api/developer-endpoint.server";
import { getDeveloperPlanUsage } from "@/features/developer-api/endpoints/plan-usage.server";

export const Route = createFileRoute("/api/dev/v1/organizations/$organizationId/plan-usage")({
  server: { handlers: { GET: developerRouteHandler(getDeveloperPlanUsage) } },
});
