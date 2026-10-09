import { exportOrderFinancials } from "@sellbridge/db/repositories";
import { isAppError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { financialSearchSchema } from "@sellbridge/shared/schemas";
import { createFileRoute } from "@tanstack/react-router";
import { buildFinancialCsv } from "@/features/reports/csv";
import { buildReportScope } from "@/lib/server/report-scope";
import { db } from "@/lib/server/db";
import { requireTenantSession } from "@/lib/server/tenant-session";

async function handleExport(request: Request): Promise<Response> {
  const session = await requireTenantSession(request.headers).catch((error: unknown) => {
    if (isAppError(error)) {
      return null;
    }
    throw error;
  });
  if (!session) {
    return new Response("Faça login para exportar o financeiro.", { status: 401 });
  }
  const search = financialSearchSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  const { period, scope } = buildReportScope(session.tenantId, search);
  const rows = await exportOrderFinancials(
    db,
    scope,
    { status: search.status, search: search.q },
    { field: search.sort, direction: search.dir },
  );
  logger.info("financial.exported", { tenantId: session.tenantId, rows: rows.length });
  const fileName = `financeiro-${period.fromDate}-a-${period.toDate}.csv`;
  return new Response(buildFinancialCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${fileName}"`,
      "cache-control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/financeiro/exportar")({
  server: {
    handlers: {
      GET: async ({ request }) => handleExport(request),
    },
  },
});
