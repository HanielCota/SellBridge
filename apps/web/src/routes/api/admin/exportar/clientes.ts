import { createFileRoute } from "@tanstack/react-router";
import { loadClientsCsv } from "@/features/admin-report/admin-export-loaders.server";
import { handleAdminExport } from "@/features/admin-report/admin-export.server";

/** One row per customer account; no e-mail, phone or CPF. */
export const Route = createFileRoute("/api/admin/exportar/clientes")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        handleAdminExport(request, {
          kind: "clientes",
          permission: "customers.manage",
          filePrefix: "clientes",
          load: loadClientsCsv,
        }),
    },
  },
});
