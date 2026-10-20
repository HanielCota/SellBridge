import { createFileRoute } from "@tanstack/react-router";
import { handleSellerProductImage } from "@/features/seller-products/images.server";

export const Route = createFileRoute("/api/admin/product-images")({
  server: { handlers: { POST: async ({ request }) => handleSellerProductImage(request, true) } },
});
