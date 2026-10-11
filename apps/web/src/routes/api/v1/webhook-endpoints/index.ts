import { createFileRoute } from "@tanstack/react-router";
import {
  createWebhookEndpoint,
  listWebhookEndpoints,
} from "@/features/public-api/endpoints/webhooks.server";
import { apiRouteHandler } from "@/features/public-api/run-endpoint.server";

export const Route = createFileRoute("/api/v1/webhook-endpoints/")({
  server: {
    handlers: {
      GET: apiRouteHandler(listWebhookEndpoints),
      POST: apiRouteHandler(createWebhookEndpoint),
    },
  },
});
