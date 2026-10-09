import { createFileRoute } from "@tanstack/react-router";
import { handleWebhook } from "@/features/webhooks/webhooks.server";

export const Route = createFileRoute("/api/webhooks/$marketplace")({
  server: {
    handlers: {
      POST: async ({ request, params }) => handleWebhook(request, params.marketplace),
    },
  },
});
