import { exportOrderFinancials } from "@sellbridge/database/repositories";
import { isAppError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { financialSearchSchema } from "@sellbridge/shared/schemas";
import { createFileRoute } from "@tanstack/react-router";
import { buildFinancialCsv } from "@/features/reports/csv";
import { buildReportScope } from "@/lib/server/report-scope";
import { database } from "@/lib/server/database";
import { requireTenantSession } from "@/lib/server/tenant-session";

/** Resolves the session, treating an expected auth failure (AppError) as "not signed in". */
async function findTenantSession(headers: Headers) {
  try {
    return await requireTenantSession(headers);
  } catch (error) {
    if (isAppError(error)) {
      return null;
    }
    throw error;
  }
}

async function handleExport(request: Request): Promise<Response> {
  const session = await findTenantSession(request.headers);
  if (!session) {
    return new Response("Faça login para exportar o financeiro.", { status: 401 });
  }
  const search = financialSearchSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  const { period, scope } = buildReportScope(session.tenantId, search);
  const rows = await exportOrderFinancials(database, scope, {
    filters: { status: search.status, search: search.query },
    sort: { field: search.sort, direction: search.direction },
  });
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
