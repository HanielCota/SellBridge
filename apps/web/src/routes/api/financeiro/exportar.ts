import { exportOrderFinancials } from "@sellbridge/database/repositories";
import { isAppError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { financialSearchSchema, ORDER_STAGE_STATUSES } from "@sellbridge/shared/schemas";
import { createFileRoute } from "@tanstack/react-router";
import { buildFinancialCsv } from "@/features/reports/csv";
import { buildReportScope, narrowToDay } from "@/features/reports/report-scope.server";
import { database } from "@/lib/server/database";
import { assertSellerProfile } from "@/lib/server/supplier-panel-access";
import { requireTenantRequest } from "@/lib/server/tenant-session";

type ExportSession =
  | { kind: "ok"; tenantId: string }
  | { kind: "signed_out" }
  | { kind: "other_profile" }
  | { kind: "supplier_profile"; message: string };

/**
 * Resolves the session of the tab's profile. A signed-in user asking for a profile outside the
 * account is told so, not asked to log in again (a 401 there sent people to a login they already
 * had); a supplier profile gets 403 with the reason.
 */
async function findExportSession(request: Request): Promise<ExportSession> {
  try {
    const session = await requireTenantRequest(request);
    return sellerOnly(session.tenantId, session.profileKind);
  } catch (error) {
    if (!isAppError(error)) {
      throw error;
    }
    if (error.code === "FORBIDDEN") {
      return { kind: "other_profile" };
    }
    return { kind: "signed_out" };
  }
}

/** The financial export is a seller screen: a supplier profile is refused with the reason. */
function sellerOnly(tenantId: string, profileKind: ProfileKind): ExportSession {
  try {
    assertSellerProfile(profileKind);
  } catch (error) {
    if (isAppError(error)) {
      return { kind: "supplier_profile", message: error.userMessage };
    }
    throw error;
  }
  return { kind: "ok", tenantId };
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
  const session = await findExportSession(request);
  if (session.kind === "signed_out") {
    return new Response("Faça login para exportar o financeiro.", { status: 401 });
  }
  if (session.kind === "other_profile") {
    return new Response("Este arquivo é de outro perfil, que não está na sua conta.", {
      status: 403,
    });
  }
  if (session.kind === "supplier_profile") {
    return new Response(session.message, { status: 403 });
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
