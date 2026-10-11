import { createFileRoute } from "@tanstack/react-router";
import { listWebhookDeliveries } from "@/features/public-api/endpoints/webhooks.server";
import { apiRouteHandler } from "@/features/public-api/run-endpoint.server";

export const Route = createFileRoute("/api/v1/webhook-endpoints/$endpointId/deliveries")({
  server: { handlers: { GET: apiRouteHandler(listWebhookDeliveries) } },
});
