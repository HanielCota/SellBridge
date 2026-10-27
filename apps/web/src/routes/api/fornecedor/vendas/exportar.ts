import { exportSupplierSaleLines } from "@sellbridge/database/repositories";
import { isAppError, type AppErrorCode } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { resolvePeriod } from "@sellbridge/shared/period-range";
import { SUPPLIER_SALES_SITUATION_STATUSES } from "@sellbridge/shared/supplier-panel-sales";
import { createFileRoute } from "@tanstack/react-router";
import { buildSupplierSalesCsv } from "@/features/supplier-panel/sales/sales-csv";
import { supplierSalesInputSchema } from "@/features/supplier-panel/sales/sales-search";
import { database } from "@/lib/server/database";
import { assertSupplierPanelAccess } from "@/lib/server/supplier-panel-access";
import { resolveSupplierPanelViewer } from "@/lib/server/supplier-panel-viewer";
import { requireTenantRequest } from "@/lib/server/tenant-session";

/** The status each refusal of the export answers with; anything else is not ours to map. */
const REFUSAL_STATUS: Partial<Record<AppErrorCode, number>> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  VALIDATION: 422,
};

/** An AppError as a plain-text answer the browser shows; other errors keep failing loudly. */
function refusalOf(error: unknown): Response {
  if (!isAppError(error)) {
    throw error;
  }
  const status = REFUSAL_STATUS[error.code];
  if (status === undefined) {
    throw error;
  }
  return new Response(error.userMessage, { status });
}

/** The supplier's sold items of the home's period and filters, as a spreadsheet. */
async function exportSupplierSales(request: Request): Promise<Response> {
  const parsed = supplierSalesInputSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return new Response("Fornecedor inválido: envie o id do fornecedor (uuid).", { status: 400 });
  }
  const { supplierId, ...search } = parsed.data;
  const session = await requireTenantRequest(request);
  assertSupplierPanelAccess(await resolveSupplierPanelViewer(session), supplierId);
  const period = resolvePeriod(search, new Date());
  const lines = await exportSupplierSaleLines(database, {
    supplierId,
    range: { from: period.from, to: period.to },
    statuses: SUPPLIER_SALES_SITUATION_STATUSES[search.situation],
    supplierProductId: search.product,
  });
  logger.info("supplier_panel.sales_exported", { supplierId, lines: lines.length });
  const fileName = `vendas-${period.fromDate}-a-${period.toDate}.csv`;
  return new Response(buildSupplierSalesCsv(lines), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${fileName}"`,
      "cache-control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/fornecedor/vendas/exportar")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return await exportSupplierSales(request);
        } catch (error) {
          return refusalOf(error);
        }
      },
    },
  },
});
