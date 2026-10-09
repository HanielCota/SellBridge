import { createFileRoute } from "@tanstack/react-router";
import { handleAdminReply } from "@/features/support/support.server";

export const Route = createFileRoute("/api/admin/chamados/$ticketId/mensagens")({
  server: {
    handlers: {
      POST: async ({ request, params }) => handleAdminReply(request, params.ticketId),
    },
  },
});
