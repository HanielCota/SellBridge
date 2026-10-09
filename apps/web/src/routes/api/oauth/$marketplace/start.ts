import { createFileRoute } from "@tanstack/react-router";
import { handleOAuthStart } from "@/features/stores/oauth.server";

export const Route = createFileRoute("/api/oauth/$marketplace/start")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handleOAuthStart(request, params.marketplace),
    },
  },
});
