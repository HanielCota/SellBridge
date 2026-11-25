import { createFileRoute } from "@tanstack/react-router";
import { developerDocsPageResponse } from "@/features/developer-api/developer-docs.server";
import { findDeveloperUserId } from "@/features/developer-api/developer-session.server";

export const Route = createFileRoute("/api/dev/v1/docs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const developerUserId = await findDeveloperUserId(request.headers);
        if (developerUserId === null) {
          return new Response("Página não encontrada", { status: 404 });
        }
        return developerDocsPageResponse();
      },
    },
  },
});
