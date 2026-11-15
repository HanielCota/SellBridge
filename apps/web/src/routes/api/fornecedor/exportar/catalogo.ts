import { createFileRoute } from "@tanstack/react-router";
import { handleProductSpreadsheetExport } from "@/features/supplier-panel/import/product-export.server";

export const Route = createFileRoute("/api/fornecedor/exportar/catalogo")({
  server: {
    handlers: {
      GET: async ({ request }) => handleProductSpreadsheetExport(request),
    },
  },
});
