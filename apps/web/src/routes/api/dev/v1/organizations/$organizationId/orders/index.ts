import { createFileRoute } from "@tanstack/react-router";
import { developerRouteHandler } from "@/features/developer-api/developer-endpoint.server";
import { listDeveloperOrders } from "@/features/developer-api/endpoints/organization-reads.server";

export const Route = createFileRoute("/api/dev/v1/organizations/$organizationId/orders/")({
  server: { handlers: { GET: developerRouteHandler(listDeveloperOrders) } },
});
