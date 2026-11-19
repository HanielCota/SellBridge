import { createFileRoute } from "@tanstack/react-router";
import { handleStateReason } from "@/features/returns/returns.server";

export const Route = createFileRoute("/api/devolucoes/$claimId/motivo")({
  server: {
    handlers: {
      POST: async ({ request, params }) => handleStateReason(request, params.claimId),
    },
  },
});
