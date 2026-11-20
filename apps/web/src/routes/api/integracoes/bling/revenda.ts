import { createFileRoute } from "@tanstack/react-router";
import { handleResellerBlingConnectStart } from "@/features/reseller-bling/reseller-bling-oauth.server";

export const Route = createFileRoute("/api/integracoes/bling/revenda")({
  server: {
    handlers: {
      GET: async ({ request }) => handleResellerBlingConnectStart(request),
    },
  },
});
