import { createFileRoute } from "@tanstack/react-router";
import { handleMercadoPagoConnectCallback } from "@/features/supplier-payments/mercado-pago-oauth.server";

export const Route = createFileRoute("/api/integracoes/mercado-pago/retorno")({
  server: { handlers: { GET: async ({ request }) => handleMercadoPagoConnectCallback(request) } },
});
