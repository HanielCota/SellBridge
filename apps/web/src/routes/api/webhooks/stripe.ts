import { createFileRoute } from "@tanstack/react-router";
import { handleBillingWebhook } from "@/features/billing/webhook.server";
export const Route = createFileRoute("/api/webhooks/stripe")({
  server: { handlers: { POST: async ({ request }) => handleBillingWebhook(request) } },
});
