import { createFileRoute } from "@tanstack/react-router";
import { handleDownloadReturnPhoto } from "@/features/returns/returns.server";

export const Route = createFileRoute("/api/devolucoes/fotos/$photoId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handleDownloadReturnPhoto(request, params.photoId),
    },
  },
});
