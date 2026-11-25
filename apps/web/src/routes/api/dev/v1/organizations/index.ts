import { createFileRoute } from "@tanstack/react-router";
import { developerRouteHandler } from "@/features/developer-api/developer-endpoint.server";
import { listDeveloperOrganizations } from "@/features/developer-api/endpoints/organizations.server";

export const Route = createFileRoute("/api/dev/v1/organizations/")({
  server: { handlers: { GET: developerRouteHandler(listDeveloperOrganizations) } },
});
