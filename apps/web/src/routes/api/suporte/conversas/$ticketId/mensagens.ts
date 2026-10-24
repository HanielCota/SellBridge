import { createFileRoute } from "@tanstack/react-router";
import { handleConversationReply } from "@/features/supplier-support/supplier-support.server";

export const Route = createFileRoute("/api/suporte/conversas/$ticketId/mensagens")({
  server: {
    handlers: {
      POST: async ({ request, params }) => handleConversationReply(request, params.ticketId),
    },
  },
});
