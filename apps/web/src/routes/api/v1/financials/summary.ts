import { createFileRoute } from "@tanstack/react-router";
import { getFinancialSummary } from "@/features/public-api/endpoints/financials.server";
import { apiRouteHandler } from "@/features/public-api/run-endpoint.server";

export const Route = createFileRoute("/api/v1/financials/summary")({
  server: { handlers: { GET: apiRouteHandler(getFinancialSummary) } },
});
