import { createFileRoute } from "@tanstack/react-router";
import { developerRouteHandler } from "@/features/developer-api/developer-endpoint.server";
import { getDeveloperOrder } from "@/features/developer-api/endpoints/orders.server";

export const Route = createFileRoute("/api/dev/v1/organizations/$organizationId/orders/$orderId")({
  server: { handlers: { GET: developerRouteHandler(getDeveloperOrder) } },
});
