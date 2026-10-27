import {
  exportSupplierProducts,
  exportSupplierShipments,
  findSupplierOfProfile,
} from "@sellbridge/database/repositories";
import { isAppError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { resolveReportPeriod, type ReportPeriod } from "@sellbridge/shared/report-period";
import { reportPeriodSearchSchema } from "@sellbridge/shared/schemas";
import { buildCsvFile, csvResponse, reportFileName } from "@/features/report-kit/csv-file";
import { database } from "@/lib/server/database";
import { assertSupplierProfile } from "@/lib/server/supplier-panel-access";
import { requireTenantRequest, type TenantSession } from "@/lib/server/tenant-session";
import {
  SUPPLIER_ORDER_HEADERS,
  SUPPLIER_PRODUCT_HEADERS,
  supplierFileSlug,
  supplierOrderRows,
  supplierProductRows,
} from "./supplier-report-csv";

/*
 * The supplier's spreadsheets, opened by the browser itself (`?perfil=` names the tab's
 * profile). Each file is of the panel's supplier only: the one the profile runs, never an id
 * from the address.
 */

interface ExportSupplier {
  id: string;
  name: string;
}

function refusal(status: number, message: string): Response {
  return new Response(message, { status, headers: { "cache-control": "no-store" } });
}

/**
 * The tab's session; a signed-in user asking for a profile outside the account is told so, not
 * sent to a login they already have (as the financial export does).
 */
async function findSession(request: Request): Promise<TenantSession | Response> {
  try {
    return await requireTenantRequest(request);
  } catch (error) {
    if (!isAppError(error)) {
      throw error;
    }
    if (error.code === "FORBIDDEN") {
      return refusal(403, "Este arquivo é de outro perfil, que não está na sua conta.");
    }
    return refusal(401, "Faça login para baixar a planilha.");
  }
}

/** The supplier of the tab's profile, or the response that says why there is no file. */
async function findExportSupplier(request: Request): Promise<ExportSupplier | Response> {
  const session = await findSession(request);
  if (session instanceof Response) {
    return session;
  }
  try {
    assertSupplierProfile(session.profileKind);
  } catch (error) {
    if (isAppError(error)) {
      return refusal(403, error.userMessage);
    }
    throw error;
  }
  const supplier = await findSupplierOfProfile(database, session.tenantId);
  if (supplier === null) {
    return refusal(403, "Cadastre sua marca para baixar as planilhas do painel.");
  }
  return supplier;
}

function periodOf(request: Request): ReportPeriod {
  const search = reportPeriodSearchSchema.parse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  return resolveReportPeriod(search, new Date());
}

/** The file, or a 422 saying why there is none (too many rows for one spreadsheet). */
async function csvOrRefusal(build: () => Promise<{ body: string; rows: number }>) {
  try {
    return await build();
  } catch (error) {
    if (isAppError(error) && error.code === "VALIDATION") {
      return refusal(422, error.userMessage);
    }
    throw error;
  }
}

type SupplierSheet = "pedidos" | "produtos";

async function buildSheet(sheet: SupplierSheet, supplierId: string, period: ReportPeriod) {
  const range = { supplierId, from: period.from, to: period.to };
  if (sheet === "pedidos") {
    const shipments = await exportSupplierShipments(database, range);
    const rows = supplierOrderRows(shipments, new Date());
    return { body: buildCsvFile(SUPPLIER_ORDER_HEADERS, rows), rows: rows.length };
  }
  const rows = supplierProductRows(await exportSupplierProducts(database, range));
  return { body: buildCsvFile(SUPPLIER_PRODUCT_HEADERS, rows), rows: rows.length };
}

/** GET handler of `/api/fornecedor/exportar/pedidos` and `/produtos`. */
export async function handleSupplierExport(
  request: Request,
  sheet: SupplierSheet,
): Promise<Response> {
  const supplier = await findExportSupplier(request);
  if (supplier instanceof Response) {
    return supplier;
  }
  const period = periodOf(request);
  const file = await csvOrRefusal(() => buildSheet(sheet, supplier.id, period));
  if (file instanceof Response) {
    return file;
  }
  logger.info("supplier_report.exported", { supplierId: supplier.id, sheet, rows: file.rows });
  const prefix = `fornecedor-${supplierFileSlug(supplier.name)}-${sheet}`;
  return csvResponse(reportFileName(prefix, period), file.body);
}
