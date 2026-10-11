import { createFileRoute } from "@tanstack/react-router";
import { openApiResponse } from "@/features/public-api/docs.server";

export const Route = createFileRoute("/api/v1/openapi.json")({
  server: { handlers: { GET: async () => openApiResponse() } },
});
