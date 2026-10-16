import { createFileRoute } from "@tanstack/react-router";
import { handleAccountExport } from "@/features/account/account-export.server";

export const Route = createFileRoute("/api/conta/exportar")({
  server: {
    handlers: {
      GET: async ({ request }) => handleAccountExport(request),
    },
  },
});
