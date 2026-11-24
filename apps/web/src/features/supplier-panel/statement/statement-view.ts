import type { StatementLine } from "@sellbridge/shared/supplier-statement";

/** One line as the statement page shows it. */
export interface StatementLineView extends StatementLine {
  id: string;
  externalOrderId: string;
  itemsLabel: string;
  paidAt: Date;
}

export interface StatementPage {
  lines: StatementLineView[];
  nextCursor: string | null;
}
