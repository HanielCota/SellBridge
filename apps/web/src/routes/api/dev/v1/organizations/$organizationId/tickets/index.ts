import { createFileRoute } from "@tanstack/react-router";
import { developerRouteHandler } from "@/features/developer-api/developer-endpoint.server";
import { listDeveloperTickets } from "@/features/developer-api/endpoints/tickets.server";

export const Route = createFileRoute("/api/dev/v1/organizations/$organizationId/tickets/")({
  server: { handlers: { GET: developerRouteHandler(listDeveloperTickets) } },
});
