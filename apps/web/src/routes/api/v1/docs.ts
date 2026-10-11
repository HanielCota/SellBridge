import { createFileRoute } from "@tanstack/react-router";
import { docsPageResponse } from "@/features/public-api/docs.server";

export const Route = createFileRoute("/api/v1/docs")({
  server: { handlers: { GET: async () => docsPageResponse() } },
});
