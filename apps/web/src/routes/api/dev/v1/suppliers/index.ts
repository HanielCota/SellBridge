import { createFileRoute } from "@tanstack/react-router";
import { developerRouteHandler } from "@/features/developer-api/developer-endpoint.server";
import { listDeveloperSuppliers } from "@/features/developer-api/endpoints/suppliers.server";

export const Route = createFileRoute("/api/dev/v1/suppliers/")({
  server: { handlers: { GET: developerRouteHandler(listDeveloperSuppliers) } },
});
