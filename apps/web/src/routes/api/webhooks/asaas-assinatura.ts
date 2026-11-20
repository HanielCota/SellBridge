import { createFileRoute } from "@tanstack/react-router";
import { handleBillingWebhook } from "@/features/billing/billing-webhook.server";

export const Route = createFileRoute("/api/webhooks/asaas-assinatura")({
  server: { handlers: { POST: async ({ request }) => handleBillingWebhook(request) } },
});
