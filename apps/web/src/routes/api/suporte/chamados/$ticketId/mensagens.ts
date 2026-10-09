import { createFileRoute } from "@tanstack/react-router";
import { handleTenantReply } from "@/features/support/support.server";

export const Route = createFileRoute("/api/suporte/chamados/$ticketId/mensagens")({
  server: {
    handlers: {
      POST: async ({ request, params }) => handleTenantReply(request, params.ticketId),
    },
  },
});
