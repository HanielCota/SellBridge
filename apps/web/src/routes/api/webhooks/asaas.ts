import { createFileRoute } from "@tanstack/react-router";
import { handleAsaasWebhook } from "@/features/supplier-payments/asaas-webhook.server";

export const Route = createFileRoute("/api/webhooks/asaas")({
  server: { handlers: { POST: async ({ request }) => handleAsaasWebhook(request) } },
});
