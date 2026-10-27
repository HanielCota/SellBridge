import { createFileRoute } from "@tanstack/react-router";
import { handleCreateConversation } from "@/features/supplier-support/supplier-support.server";

export const Route = createFileRoute("/api/suporte/conversas/")({
  server: {
    handlers: {
      POST: async ({ request }) => handleCreateConversation(request),
    },
  },
});
