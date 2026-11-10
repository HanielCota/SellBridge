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
  /** Since when new orders get their NF-e through Bling (ISO 8601, UTC); null while off. */
  readonly invoiceEnabledAt: string | null;
  /** Whether the supplier's fiscal data on Marca is complete enough to issue notes. */
  readonly fiscalReady: boolean;
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
  readonly invoiceEnabledAt: Date | null;
}

interface ReadRow {
  readonly id: string;
  readonly status: BlingReadStatus;
  readonly readProducts: number;
  readonly totalProducts: number | null;
  readonly error: string | null;
  readonly startedAt: Date;
}

/**
 * A full read (1,000 products at 3 per second) takes about six minutes; one still "reading" long
 * after that lost its worker, and would keep the page waiting until it expires a day later.
 */
const STALLED_READ_AFTER_IN_MS = 30 * 60 * 1000;
const STALLED_READ_MESSAGE =
  "A leitura do Bling parou no meio. Clique em Importar do Bling para tentar de novo.";

function readView(read: ReadRow, now: Date): BlingReadView {
  const view = {
    id: read.id,
    status: read.status,
    readProducts: read.readProducts,
    totalProducts: read.totalProducts,
    error: read.error,
  };
  const stalled =
    read.status === "reading" &&
    now.getTime() - read.startedAt.getTime() > STALLED_READ_AFTER_IN_MS;
  return stalled ? { ...view, status: "failed", error: STALLED_READ_MESSAGE } : view;
}

/** The page's view; nothing about the account leaks while the feature is off. */
export function blingOverviewFrom(input: {
  available: boolean;
  connection: ConnectionRow | null;
  read: ReadRow | null;
  fiscalReady: boolean;
  now: Date;
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
            invoiceEnabledAt: connection.invoiceEnabledAt?.toISOString() ?? null,
            fiscalReady: input.fiscalReady,
          },
    read: connection === null || read === null ? null : readView(read, input.now),
  };
}

export interface BlingImportOutcome extends SupplierImportResult {
  /** Rows the import refused (a product rule), with the reasons in `failedRowsCsv`. */
  readonly failedRows: number;
  readonly failedRowsCsv: string;
}
