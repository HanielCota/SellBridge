import { createFileRoute } from "@tanstack/react-router";
import { developerRouteHandler } from "@/features/developer-api/developer-endpoint.server";
import { getDeveloperCatalogProduct } from "@/features/developer-api/endpoints/organization-reads.server";

export const Route = createFileRoute(
  "/api/dev/v1/organizations/$organizationId/catalog/products/$productId",
)({
  server: { handlers: { GET: developerRouteHandler(getDeveloperCatalogProduct) } },
});
