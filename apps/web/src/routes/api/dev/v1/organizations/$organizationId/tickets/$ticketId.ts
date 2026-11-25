import { createFileRoute } from "@tanstack/react-router";
import { developerRouteHandler } from "@/features/developer-api/developer-endpoint.server";
import { getDeveloperTicket } from "@/features/developer-api/endpoints/tickets.server";

export const Route = createFileRoute("/api/dev/v1/organizations/$organizationId/tickets/$ticketId")(
  {
    server: { handlers: { GET: developerRouteHandler(getDeveloperTicket) } },
  },
);
