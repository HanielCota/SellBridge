import { createFileRoute } from "@tanstack/react-router";
import { listCatalogProducts } from "@/features/public-api/endpoints/catalog.server";
import { apiRouteHandler } from "@/features/public-api/run-endpoint.server";

export const Route = createFileRoute("/api/v1/catalog/products/")({
  server: { handlers: { GET: apiRouteHandler(listCatalogProducts) } },
});
