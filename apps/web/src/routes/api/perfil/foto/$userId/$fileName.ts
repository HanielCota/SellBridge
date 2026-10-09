import { createFileRoute } from "@tanstack/react-router";
import { handleGetAvatar } from "@/features/profile/avatar.server";

export const Route = createFileRoute("/api/perfil/foto/$userId/$fileName")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handleGetAvatar(request, params),
    },
  },
});
