import { createFileRoute } from "@tanstack/react-router";
import { developerRouteHandler } from "@/features/developer-api/developer-endpoint.server";
import { getDeveloperOrderHistory } from "@/features/developer-api/endpoints/order-history.server";

export const Route = createFileRoute(
  "/api/dev/v1/organizations/$organizationId/orders/$orderId/history",
)({
  server: { handlers: { GET: developerRouteHandler(getDeveloperOrderHistory) } },
});
