import { createFileRoute } from "@tanstack/react-router";
import { handleDownloadAttachment } from "@/features/support/support.server";

export const Route = createFileRoute("/api/suporte/anexos/$attachmentId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handleDownloadAttachment(request, params.attachmentId),
    },
  },
});
