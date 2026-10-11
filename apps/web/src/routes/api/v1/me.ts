import { createFileRoute } from "@tanstack/react-router";
import { getMe } from "@/features/public-api/endpoints/me.server";
import { apiRouteHandler } from "@/features/public-api/run-endpoint.server";

export const Route = createFileRoute("/api/v1/me")({
  server: { handlers: { GET: apiRouteHandler(getMe) } },
});
