import { createFileRoute } from "@tanstack/react-router";
import { handleGetProductImage } from "@/features/supplier-panel/catalog/product-image.server";

export const Route = createFileRoute("/api/produtos/imagens/$supplierId/$fileName")({
  server: {
    handlers: {
      GET: async ({ params }) => handleGetProductImage(params),
    },
  },
});
