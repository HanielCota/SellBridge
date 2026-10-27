import { recordReportExport, type AdminExportKind } from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import {
  resolveReportPeriod,
  reportPeriodSearchOf,
  type ReportPeriod,
} from "@sellbridge/shared/report-period";
import { optionalParameter, reportPeriodSearchSchema } from "@sellbridge/shared/schemas";
import type { StaffPermission } from "@sellbridge/shared/staff-access";
import { z } from "zod";
import { buildCsvFile, csvResponse, reportFileName } from "@/features/report-kit/csv-file";
import { auth } from "@/lib/server/auth";
import { database } from "@/lib/server/database";
import { adminModeFromCookie, exportRefusal } from "./admin-export-access";
import type { CsvTable } from "./admin-export-csv";

/** Past this many rows a spreadsheet no longer opens well: the route asks for a shorter period. */
export const EXPORT_ROW_LIMIT = 20_000;

/** The period, plus `nomes=0` to number the team instead of naming it. */
const exportSearchSchema = reportPeriodSearchSchema.extend({
  nomes: optionalParameter(z.enum(["0", "1"])),
});

export interface ExportLoadInput {
  period: ReportPeriod;
  names: boolean;
  now: Date;
  /** Loaders read at most one row past this, so a cut file is never sent as whole. */
  limit: number;
}

export interface AdminExportSpec {
  kind: AdminExportKind;
  permission: StaffPermission;
  /** "suporte-equipe" → "suporte-equipe-2026-10.csv". */
  filePrefix: string;
  load: (input: ExportLoadInput) => Promise<CsvTable>;
}

async function requesterOf(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  return {
    signedIn: session !== null,
    userId: session?.user.id ?? null,
    role: session?.user.role ?? null,
    adminMode: adminModeFromCookie(request.headers.get("cookie")),
  };
}

function periodKey(period: ReportPeriod): string {
  const search = reportPeriodSearchOf(period);
  return "mes" in search ? search.mes : `${search.de}..${search.ate}`;
}

async function buildExport(spec: AdminExportSpec, request: Request, staffId: string) {
  const search = exportSearchSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  const now = new Date();
  const period = resolveReportPeriod(search, now);
  const names = search.nomes !== "0";
  const table = await spec.load({ period, names, now, limit: EXPORT_ROW_LIMIT });
  if (table.rows.length > EXPORT_ROW_LIMIT) {
    return new Response(
      `Mais de ${EXPORT_ROW_LIMIT.toLocaleString("pt-BR")} linhas neste período: escolha um período menor.`,
      { status: 422 },
    );
  }
  await recordReportExport(database, {
    adminId: staffId,
    kind: spec.kind,
    period: periodKey(period),
    names,
  });
  logger.info("admin.report_exported", {
    kind: spec.kind,
    period: periodKey(period),
    rows: table.rows.length,
    staffId,
    names,
  });
  return csvResponse(
    reportFileName(spec.filePrefix, period),
    buildCsvFile(table.headers, table.rows),
  );
}

/**
 * An admin spreadsheet: checks who asks (signed in, team role, admin mode, the file's
 * permission), reads the period, refuses a file past the row limit and records the download in
 * the audit trail before sending it.
 */
export async function handleAdminExport(
  request: Request,
  spec: AdminExportSpec,
): Promise<Response> {
  try {
    const requester = await requesterOf(request);
    const refusal = exportRefusal(requester, spec.permission);
    if (refusal !== null) {
      return new Response(refusal.message, { status: refusal.status });
    }
    if (requester.userId === null) {
      return new Response("Faça login para baixar esta planilha.", { status: 401 });
    }
    return await buildExport(spec, request, requester.userId);
  } catch (error) {
    logger.error("admin.report_export_failed", { kind: spec.kind, error });
    return new Response("Não foi possível gerar a planilha agora. Tente de novo em instantes.", {
      status: 500,
    });
  }
}
