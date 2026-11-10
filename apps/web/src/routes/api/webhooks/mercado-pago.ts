import { createFileRoute } from "@tanstack/react-router";
import { handleMercadoPagoWebhook } from "@/features/supplier-payments/mercado-pago-webhook.server";

export const Route = createFileRoute("/api/webhooks/mercado-pago")({
  server: { handlers: { POST: async ({ request }) => handleMercadoPagoWebhook(request) } },
});
