import { createFileRoute } from "@tanstack/react-router";
import { developerPostRouteHandler } from "@/features/developer-api/developer-endpoint.server";
import { createDeveloperEntryLinkEndpoint } from "@/features/developer-api/endpoints/entry-links.server";

export const Route = createFileRoute("/api/dev/v1/entry-links")({
  server: { handlers: { POST: developerPostRouteHandler(createDeveloperEntryLinkEndpoint) } },
});
