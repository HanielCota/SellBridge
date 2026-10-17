import { exportOrderFinancials } from "@sellbridge/database/repositories";
import { isAppError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { financialSearchSchema, ORDER_STAGE_STATUSES } from "@sellbridge/shared/schemas";
import { createFileRoute } from "@tanstack/react-router";
import { buildFinancialCsv } from "@/features/reports/csv";
import { buildReportScope, narrowToDay } from "@/features/reports/report-scope.server";
import { database } from "@/lib/server/database";
import { requireTenantRequest } from "@/lib/server/tenant-session";

/** Resolves the session, treating an expected auth failure (AppError) as "not signed in". */
async function findTenantSession(request: Request) {
  try {
    return await requireTenantRequest(request);
  } catch (error) {
    if (isAppError(error)) {
      return null;
    }
    throw error;
  }
}

/** The period's rows, or a 422 saying why there is no file (too many orders for one export). */
async function exportRows(
  scope: Parameters<typeof exportOrderFinancials>[1],
  search: ReturnType<typeof financialSearchSchema.parse>,
) {
  try {
    return await exportOrderFinancials(database, scope, {
      filters: {
        statuses: search.stage ? ORDER_STAGE_STATUSES[search.stage] : undefined,
        search: search.query,
      },
      sort: { field: search.sort, direction: search.direction },
    });
  } catch (error) {
    if (isAppError(error) && error.code === "VALIDATION") {
      return new Response(error.message, { status: 422 });
    }
    throw error;
  }
}

async function handleExport(request: Request): Promise<Response> {
  const session = await findTenantSession(request);
  if (!session) {
    return new Response("Faça login para exportar o financeiro.", { status: 401 });
  }
  const search = financialSearchSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  const { period, scope } = buildReportScope(session.tenantId, search);
  const picked = narrowToDay(scope, period, search.day);
  const rows = await exportRows(picked.scope, search);
  if (rows instanceof Response) {
    return rows;
  }
  logger.info("financial.exported", { tenantId: session.tenantId, rows: rows.length });
  const fileName = picked.day
    ? `financeiro-${picked.day}.csv`
    : `financeiro-${period.fromDate}-a-${period.toDate}.csv`;
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
