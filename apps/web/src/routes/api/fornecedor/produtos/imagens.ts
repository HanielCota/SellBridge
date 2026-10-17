import { createFileRoute } from "@tanstack/react-router";
import { handleUploadProductImage } from "@/features/supplier-panel/catalog/product-image.server";

export const Route = createFileRoute("/api/fornecedor/produtos/imagens")({
  server: {
    handlers: {
      POST: async ({ request }) => handleUploadProductImage(request),
    },
  },
});
