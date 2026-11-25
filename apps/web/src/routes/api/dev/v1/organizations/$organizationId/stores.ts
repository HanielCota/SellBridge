import { createFileRoute } from "@tanstack/react-router";
import { developerRouteHandler } from "@/features/developer-api/developer-endpoint.server";
import { listDeveloperStores } from "@/features/developer-api/endpoints/organization-reads.server";

export const Route = createFileRoute("/api/dev/v1/organizations/$organizationId/stores")({
  server: { handlers: { GET: developerRouteHandler(listDeveloperStores) } },
});
