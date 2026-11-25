import { createFileRoute } from "@tanstack/react-router";
import { developerRouteHandler } from "@/features/developer-api/developer-endpoint.server";
import { listDeveloperListings } from "@/features/developer-api/endpoints/organization-reads.server";

export const Route = createFileRoute("/api/dev/v1/organizations/$organizationId/listings/")({
  server: { handlers: { GET: developerRouteHandler(listDeveloperListings) } },
});
