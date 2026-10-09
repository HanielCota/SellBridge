import { createFileRoute } from "@tanstack/react-router";
import { handleDeleteAvatar, handleUploadAvatar } from "@/features/profile/avatar.server";

export const Route = createFileRoute("/api/perfil/foto")({
  server: {
    handlers: {
      POST: async ({ request }) => handleUploadAvatar(request),
      DELETE: async ({ request }) => handleDeleteAvatar(request),
    },
  },
});
