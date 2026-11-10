import type { SupplierImportResult } from "@sellbridge/shared/supplier-panel-import-schemas";

/** What the import page shows about the supplier's Bling account and its latest catalog read. */
export interface BlingOverview {
  /** False while the Bling app keys are not configured: the page hides the Bling card. */
  readonly available: boolean;
  readonly connection: BlingConnectionView | null;
  readonly read: BlingReadView | null;
}

export type BlingConnectionStatus = "connected" | "expired" | "error" | "disconnected";

export interface BlingConnectionView {
  readonly status: BlingConnectionStatus;
  readonly accountName: string | null;
  /** ISO 8601, UTC. */
  readonly connectedAt: string;
  readonly lastImportAt: string | null;
  /** The discount rule saved by the last import, in tenths of a percent. */
  readonly resellerDiscountTenths: number | null;
}

export type BlingReadStatus = "reading" | "ready" | "failed";

export interface BlingReadView {
  readonly id: string;
  readonly status: BlingReadStatus;
  readonly readProducts: number;
  readonly totalProducts: number | null;
  readonly error: string | null;
}

interface ConnectionRow {
  readonly status: BlingConnectionStatus;
  readonly accountName: string | null;
  readonly connectedAt: Date;
  readonly lastImportAt: Date | null;
  readonly resellerDiscountTenths: number | null;
}

interface ReadRow {
  readonly id: string;
  readonly status: BlingReadStatus;
  readonly readProducts: number;
  readonly totalProducts: number | null;
  readonly error: string | null;
}

/** The page's view; nothing about the account leaks while the feature is off. */
export function blingOverviewFrom(input: {
  available: boolean;
  connection: ConnectionRow | null;
  read: ReadRow | null;
}): BlingOverview {
  if (!input.available) {
    return { available: false, connection: null, read: null };
  }
  const { connection, read } = input;
  return {
    available: true,
    connection:
      connection === null
        ? null
        : {
            status: connection.status,
            accountName: connection.accountName,
            connectedAt: connection.connectedAt.toISOString(),
            lastImportAt: connection.lastImportAt?.toISOString() ?? null,
            resellerDiscountTenths: connection.resellerDiscountTenths,
          },
    read:
      connection === null || read === null
        ? null
        : {
            id: read.id,
            status: read.status,
            readProducts: read.readProducts,
            totalProducts: read.totalProducts,
            error: read.error,
          },
  };
}

export interface BlingImportOutcome extends SupplierImportResult {
  /** Rows the import refused (a product rule), with the reasons in `failedRowsCsv`. */
  readonly failedRows: number;
  readonly failedRowsCsv: string;
}
