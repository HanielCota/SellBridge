import { createFileRoute } from "@tanstack/react-router";
import { listOrders } from "@/features/public-api/endpoints/orders.server";
import { apiRouteHandler } from "@/features/public-api/run-endpoint.server";

export const Route = createFileRoute("/api/v1/orders/")({
  server: { handlers: { GET: apiRouteHandler(listOrders) } },
});
