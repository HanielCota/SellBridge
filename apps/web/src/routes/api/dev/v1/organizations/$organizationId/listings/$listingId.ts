import { createFileRoute } from "@tanstack/react-router";
import { developerRouteHandler } from "@/features/developer-api/developer-endpoint.server";
import { getDeveloperListing } from "@/features/developer-api/endpoints/organization-reads.server";

export const Route = createFileRoute(
  "/api/dev/v1/organizations/$organizationId/listings/$listingId",
)({
  server: { handlers: { GET: developerRouteHandler(getDeveloperListing) } },
});
