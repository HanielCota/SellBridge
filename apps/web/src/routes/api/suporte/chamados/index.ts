import { createFileRoute } from "@tanstack/react-router";
import { handleCreateTicket } from "@/features/support/support.server";

export const Route = createFileRoute("/api/suporte/chamados/")({
  server: {
    handlers: {
      POST: async ({ request }) => handleCreateTicket(request),
    },
  },
});
