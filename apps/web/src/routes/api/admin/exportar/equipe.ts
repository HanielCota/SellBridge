import { createFileRoute } from "@tanstack/react-router";
import { loadTeamCsv } from "@/features/admin-report/admin-export-loaders.server";
import { handleAdminExport } from "@/features/admin-report/admin-export.server";

/** One row per person who replied or closed tickets in the period, former members included. */
export const Route = createFileRoute("/api/admin/exportar/equipe")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        handleAdminExport(request, {
          kind: "equipe",
          permission: "support.metrics",
          filePrefix: "suporte-equipe",
          load: loadTeamCsv,
        }),
    },
  },
});
