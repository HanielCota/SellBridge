import { createFileRoute } from "@tanstack/react-router";
import { handleMercadoPagoConnectStart } from "@/features/supplier-payments/mercado-pago-oauth.server";

export const Route = createFileRoute("/api/integracoes/mercado-pago/conectar")({
  server: { handlers: { GET: async ({ request }) => handleMercadoPagoConnectStart(request) } },
});
