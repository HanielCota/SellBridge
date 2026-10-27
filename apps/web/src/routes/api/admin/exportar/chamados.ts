import { createFileRoute } from "@tanstack/react-router";
import { loadTicketsCsv } from "@/features/admin-report/admin-export-loaders.server";
import { handleAdminExport } from "@/features/admin-report/admin-export.server";

/** One row per ticket opened in the period; no customer contact data. */
export const Route = createFileRoute("/api/admin/exportar/chamados")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        handleAdminExport(request, {
          kind: "chamados",
          permission: "support.metrics",
          filePrefix: "suporte-chamados",
          load: loadTicketsCsv,
        }),
    },
  },
});
