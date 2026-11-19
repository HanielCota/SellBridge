import { createFileRoute } from "@tanstack/react-router";
import { handleSupplierAnswer } from "@/features/returns/returns.server";

export const Route = createFileRoute("/api/devolucoes/$claimId/resposta")({
  server: {
    handlers: {
      POST: async ({ request, params }) => handleSupplierAnswer(request, params.claimId),
    },
  },
});
