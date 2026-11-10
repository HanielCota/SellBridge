import { createFileRoute } from "@tanstack/react-router";
import { handleBlingConnectCallback } from "@/features/supplier-panel/bling/bling-oauth.server";

export const Route = createFileRoute("/api/integracoes/bling/retorno")({
  server: {
    handlers: {
      GET: async ({ request }) => handleBlingConnectCallback(request),
    },
  },
});
