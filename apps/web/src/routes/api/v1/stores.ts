import { createFileRoute } from "@tanstack/react-router";
import { listStores } from "@/features/public-api/endpoints/stores.server";
import { apiRouteHandler } from "@/features/public-api/run-endpoint.server";

export const Route = createFileRoute("/api/v1/stores")({
  server: { handlers: { GET: apiRouteHandler(listStores) } },
});
