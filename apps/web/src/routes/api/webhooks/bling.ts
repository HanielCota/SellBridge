import { createFileRoute } from "@tanstack/react-router";
import { handleBlingWebhook } from "@/features/supplier-panel/bling/bling-webhook.server";

export const Route = createFileRoute("/api/webhooks/bling")({
  server: { handlers: { POST: async ({ request }) => handleBlingWebhook(request) } },
});
