import { createFileRoute } from "@tanstack/react-router";
import { developerRouteHandler } from "@/features/developer-api/developer-endpoint.server";
import { getDeveloperMe } from "@/features/developer-api/endpoints/me.server";

export const Route = createFileRoute("/api/dev/v1/me")({
  server: { handlers: { GET: developerRouteHandler(getDeveloperMe) } },
});
