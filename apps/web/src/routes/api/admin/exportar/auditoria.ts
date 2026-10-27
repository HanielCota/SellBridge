import { createFileRoute } from "@tanstack/react-router";
import { loadAuditCsv } from "@/features/admin-report/admin-export-loaders.server";
import { handleAdminExport } from "@/features/admin-report/admin-export.server";

/** One row per action of the team in the period. */
export const Route = createFileRoute("/api/admin/exportar/auditoria")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        handleAdminExport(request, {
          kind: "auditoria",
          permission: "audit.view",
          filePrefix: "auditoria",
          load: loadAuditCsv,
        }),
    },
  },
});
