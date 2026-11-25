import { createFileRoute } from "@tanstack/react-router";
import { developerRouteHandler } from "@/features/developer-api/developer-endpoint.server";
import { getDeveloperOrganization } from "@/features/developer-api/endpoints/organizations.server";

export const Route = createFileRoute("/api/dev/v1/organizations/$organizationId/")({
  server: { handlers: { GET: developerRouteHandler(getDeveloperOrganization) } },
});
