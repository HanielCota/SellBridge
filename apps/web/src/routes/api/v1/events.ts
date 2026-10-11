import { createFileRoute } from "@tanstack/react-router";
import { listEvents } from "@/features/public-api/endpoints/events.server";
import { apiRouteHandler } from "@/features/public-api/run-endpoint.server";

export const Route = createFileRoute("/api/v1/events")({
  server: { handlers: { GET: apiRouteHandler(listEvents) } },
});
