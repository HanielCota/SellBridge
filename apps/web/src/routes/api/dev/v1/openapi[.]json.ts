import { createFileRoute } from "@tanstack/react-router";
import { developerRouteHandler } from "@/features/developer-api/developer-endpoint.server";
import { getDeveloperOpenApi } from "@/features/developer-api/endpoints/openapi.server";

export const Route = createFileRoute("/api/dev/v1/openapi.json")({
  server: { handlers: { GET: developerRouteHandler(getDeveloperOpenApi) } },
});
