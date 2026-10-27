import { type QueueDeadline, urgencyFor } from "@sellbridge/shared/supplier-panel-orders";

interface DeadlineRow {
  deadline: QueueDeadline | null;
}

/** How many of the rows on screen are past their deadline, read against the live clock. */
export function lateCount(rows: readonly DeadlineRow[], now: Date): number {
  return rows.filter((row) => {
    if (row.deadline === null) {
      return false;
    }
    return urgencyFor(row.deadline.at.getTime() - now.getTime()) === "overdue";
  }).length;
}

/**
 * "3 atrasados", or null when nothing is late. The home loads only the first page of a group,
 * sorted late first: when every loaded row is late and more wait behind, the count is a floor.
 */
export function lateNote({
  late,
  loaded,
  total,
}: {
  late: number;
  loaded: number;
  total: number;
}): string | null {
  if (late === 0) {
    return null;
  }
  const noun = late === 1 ? "atrasado" : "atrasados";
  if (late === loaded && total > loaded) {
    return `${late} ou mais ${noun}`;
  }
  return `${late} ${noun}`;
}

interface CatalogFixKind {
  kind: string;
}

/** "1 reprovado", "2 sem estoque", or both, for the catalog cell of the summary. */
export function catalogNote(fixes: readonly CatalogFixKind[]): string {
  const soldOut = fixes.filter((fix) => fix.kind === "out_of_stock").length;
  const rejected = fixes.length - soldOut;
  const parts = [
    rejected === 0 ? null : `${rejected} ${rejected === 1 ? "reprovado" : "reprovados"}`,
    soldOut === 0 ? null : `${soldOut} sem estoque`,
  ].filter((part) => part !== null);
  if (parts.length === 0) {
    return "Nada para ajustar";
  }
  return parts.join(", ");
}
