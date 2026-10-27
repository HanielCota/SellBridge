import { createFileRoute } from "@tanstack/react-router";
import { handleSupplierExport } from "@/features/supplier-panel/report/supplier-export.server";

export const Route = createFileRoute("/api/fornecedor/exportar/produtos")({
  server: {
    handlers: {
      GET: async ({ request }) => handleSupplierExport(request, "produtos"),
    },
  },
});
