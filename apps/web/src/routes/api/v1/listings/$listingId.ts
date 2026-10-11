import { createFileRoute } from "@tanstack/react-router";
import { updateListing } from "@/features/public-api/endpoints/listings-write.server";
import { getListing } from "@/features/public-api/endpoints/listings-read.server";
import { apiRouteHandler } from "@/features/public-api/run-endpoint.server";

export const Route = createFileRoute("/api/v1/listings/$listingId")({
  server: { handlers: { GET: apiRouteHandler(getListing), PATCH: apiRouteHandler(updateListing) } },
});
