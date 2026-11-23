import {
  listSupplierStatementPayments,
  listSupplierStatementRows,
} from "@sellbridge/database/repositories";
import { resolveReportPeriod } from "@sellbridge/shared/report-period";
import type { ReportPeriodSearch } from "@sellbridge/shared/schemas";
import {
  statementLineOf,
  statementTotalsOf,
  type StatementTotals,
} from "@sellbridge/shared/supplier-statement";
import { validationError } from "@sellbridge/shared/errors";
import { database } from "@/lib/server/database";
import { decodeStatementCursor, encodeStatementCursor } from "./statement-cursor";
import { statementItemsLabel } from "./statement-text";
import type { StatementPage } from "./statement-view";

export const STATEMENT_PAGE_SIZE = 25;

/** The period's totals, from every paid parcel of the supplier in it. */
export async function loadStatementTotals(input: {
  supplierId: string;
  search: ReportPeriodSearch;
  now: Date;
}): Promise<StatementTotals> {
  const period = resolveReportPeriod(input.search, input.now);
  const payments = await listSupplierStatementPayments(database, {
    supplierId: input.supplierId,
    from: period.from,
    to: period.to,
  });
  return statementTotalsOf(payments.map(statementLineOf));
}

function cursorOf(cursor: string | undefined) {
  if (cursor === undefined) {
    return null;
  }
  const decoded = decodeStatementCursor(cursor);
  if (decoded === null) {
    throw validationError("Não foi possível carregar mais pedidos. Recarregue a página.");
  }
  return decoded;
}

/** One page of the period's paid parcels, newest payment first. */
export async function loadStatementPage(input: {
  supplierId: string;
  search: ReportPeriodSearch;
  cursor: string | undefined;
  now: Date;
}): Promise<StatementPage> {
  const period = resolveReportPeriod(input.search, input.now);
  const rows = await listSupplierStatementRows(database, {
    supplierId: input.supplierId,
    from: period.from,
    to: period.to,
    cursor: cursorOf(input.cursor),
    limit: STATEMENT_PAGE_SIZE + 1,
  });
  const lines = rows.slice(0, STATEMENT_PAGE_SIZE).map((row) => ({
    ...statementLineOf(row),
    id: row.id,
    externalOrderId: row.externalOrderId,
    itemsLabel: statementItemsLabel(row.items),
    paidAt: row.paidAt,
  }));
  const last = lines.at(-1);
  const hasMore = rows.length > STATEMENT_PAGE_SIZE;
  return {
    lines,
    nextCursor: hasMore && last !== undefined ? encodeStatementCursor(last) : null,
  };
}
