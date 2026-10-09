import { createFileRoute } from "@tanstack/react-router";
import { handleOAuthCallback } from "@/features/stores/oauth.server";

export const Route = createFileRoute("/api/oauth/$marketplace/callback")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handleOAuthCallback(request, params.marketplace),
    },
  },
});
