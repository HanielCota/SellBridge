import { createFileRoute } from "@tanstack/react-router";
import { getOrder } from "@/features/public-api/endpoints/orders.server";
import { apiRouteHandler } from "@/features/public-api/run-endpoint.server";

export const Route = createFileRoute("/api/v1/orders/$orderId")({
  server: { handlers: { GET: apiRouteHandler(getOrder) } },
});
