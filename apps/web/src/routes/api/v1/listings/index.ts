import { createFileRoute } from "@tanstack/react-router";
import { createListing } from "@/features/public-api/endpoints/listings-write.server";
import { listListings } from "@/features/public-api/endpoints/listings-read.server";
import { apiRouteHandler } from "@/features/public-api/run-endpoint.server";

export const Route = createFileRoute("/api/v1/listings/")({
  server: {
    handlers: { GET: apiRouteHandler(listListings), POST: apiRouteHandler(createListing) },
  },
});
