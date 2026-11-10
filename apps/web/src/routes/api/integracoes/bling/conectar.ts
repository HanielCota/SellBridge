import { createFileRoute } from "@tanstack/react-router";
import { handleBlingConnectStart } from "@/features/supplier-panel/bling/bling-oauth.server";

export const Route = createFileRoute("/api/integracoes/bling/conectar")({
  server: {
    handlers: {
      GET: async ({ request }) => handleBlingConnectStart(request),
    },
  },
});
