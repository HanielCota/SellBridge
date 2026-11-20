import {
  parseErpCatalogExportResult,
  type RefusedErpProduct,
} from "@sellbridge/shared/erp-catalog-export";
import type { ErpImportRow } from "@sellbridge/shared/erp-catalog";
import type { SupplierImportResult } from "@sellbridge/shared/supplier-panel-import-schemas";
import { formatAbsoluteTime } from "@/lib/relative-time";

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
  /** When the stock last matched Bling in a full check (ISO 8601, UTC); null before the first. */
  readonly stockCheckedAt: string | null;
  /** The latest "Enviar ao Bling o que falta lá"; null when it was never asked for. */
  readonly catalogExport: BlingExportView | null;
}

/** The latest send of missing products to Bling, as the card shows it. Times in ISO 8601, UTC. */
export type BlingExportView =
  | { readonly status: "sending"; readonly requestedAt: string }
  | {
      readonly status: "done";
      readonly finishedAt: string;
      readonly created: number;
      readonly alreadyInErp: number;
      readonly refusedTotal: number;
      readonly refused: readonly RefusedErpProduct[];
    }
  | { readonly status: "failed"; readonly finishedAt: string; readonly reason: string };

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
  readonly stockCheckedAt: Date | null;
  readonly catalogExportRequestedAt: Date | null;
  readonly catalogExportFinishedAt: Date | null;
  readonly catalogExportResult: unknown;
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

/**
 * A send takes minutes even for a large catalog (3 attempts, a minute apart at most); one still
 * running long after that lost its worker.
 */
const STALLED_EXPORT_AFTER_IN_MS = 2 * 60 * 60 * 1000;
const STALLED_EXPORT_MESSAGE =
  "O envio ao Bling parou no meio. Clique em Enviar ao Bling o que falta lá para tentar de novo.";
const UNREADABLE_EXPORT_MESSAGE =
  "Não deu para ler o resultado do último envio. Clique em Enviar ao Bling o que falta lá para enviar de novo.";

function isSending(connection: ConnectionRow): boolean {
  const requested = connection.catalogExportRequestedAt;
  const finished = connection.catalogExportFinishedAt;
  return requested !== null && (finished === null || requested > finished);
}

function exportView(connection: ConnectionRow, now: Date): BlingExportView | null {
  const requested = connection.catalogExportRequestedAt;
  if (requested !== null && isSending(connection)) {
    const stalled = now.getTime() - requested.getTime() > STALLED_EXPORT_AFTER_IN_MS;
    return stalled
      ? { status: "failed", finishedAt: requested.toISOString(), reason: STALLED_EXPORT_MESSAGE }
      : { status: "sending", requestedAt: requested.toISOString() };
  }
  const finished = connection.catalogExportFinishedAt;
  if (finished === null) {
    return null;
  }
  const result = parseErpCatalogExportResult(connection.catalogExportResult);
  if (result === null) {
    return {
      status: "failed",
      finishedAt: finished.toISOString(),
      reason: UNREADABLE_EXPORT_MESSAGE,
    };
  }
  if (result.kind === "failed") {
    return { status: "failed", finishedAt: finished.toISOString(), reason: result.reason };
  }
  return {
    status: "done",
    finishedAt: finished.toISOString(),
    created: result.created,
    alreadyInErp: result.alreadyInErp,
    refusedTotal: result.refusedTotal,
    refused: result.refused,
  };
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
            stockCheckedAt: connection.stockCheckedAt?.toISOString() ?? null,
            catalogExport: exportView(connection, input.now),
          },
    read: connection === null || read === null ? null : readView(read, input.now),
  };
}

/** What the card says about stock, which follows Bling on its own for every connected account. */
export function blingStockLine(connection: BlingConnectionView): string {
  if (connection.stockCheckedAt === null) {
    return "Estoque atualizado sozinho pelo Bling · a primeira conferência sai em até 15 minutos.";
  }
  return `Estoque atualizado sozinho pelo Bling · última conferência: ${formatAbsoluteTime(new Date(connection.stockCheckedAt))}.`;
}

export interface BlingImportOutcome extends SupplierImportResult {
  /** Rows the import refused (a product rule), with the reasons in `failedRowsCsv`. */
  readonly failedRows: number;
  readonly failedRowsCsv: string;
  /** Imported products whose description came with emojis, stored without them. */
  readonly emojisRemoved: number;
}

const integer = new Intl.NumberFormat("pt-BR");

/** A send still running: the card follows it until it ends. */
export function isBlingExportRunning(overview: BlingOverview | undefined): boolean {
  return overview?.connection?.catalogExport?.status === "sending";
}

/** A read still moving: a new one would only replace it and spend the account's quota twice. */
export function isBlingReadRunning(overview: BlingOverview): boolean {
  return overview.read?.status === "reading";
}

/** Why products of a read were left out: no code in Bling, or a code another product already has. */
export interface BlingProductCounts {
  /** Products as the product list will show them: a grid once, whatever its variations. */
  readonly products: number;
  readonly existing: number;
  readonly fresh: number;
  readonly grids: number;
  readonly gridVariations: number;
}

/**
 * The read's rows counted as products: a grid's variations are one product, new while any of
 * them is new; a product of its own is one.
 */
export function countBlingProducts(
  rows: readonly Pick<ErpImportRow, "sku" | "needsCost" | "modelCode">[],
): BlingProductCounts {
  const fresh = new Map<string, boolean>();
  for (const row of rows) {
    const key = row.modelCode === null ? `sku:${row.sku}` : `grid:${row.modelCode}`;
    fresh.set(key, (fresh.get(key) ?? false) || row.needsCost);
  }
  const freshCount = [...fresh.values()].filter((isFresh) => isFresh).length;
  const gridRows = rows.filter((row) => row.modelCode !== null);
  return {
    products: fresh.size,
    existing: fresh.size - freshCount,
    fresh: freshCount,
    grids: new Set(gridRows.map((row) => row.modelCode)).size,
    gridVariations: gridRows.length,
  };
}

/** How a read's grids come in, so the product count above them adds up. */
export function gridProductsNote(
  counts: Pick<BlingProductCounts, "grids" | "gridVariations">,
): string {
  const variations = integer.format(counts.gridVariations);
  if (counts.grids === 1) {
    return `1 deles tem cores e tamanhos: as ${variations} variações entram como um produto só, cada uma com o próprio preço.`;
  }
  return `${integer.format(counts.grids)} deles têm cores e tamanhos: as ${variations} variações entram como ${integer.format(counts.grids)} produtos, cada variação com o próprio preço.`;
}

/** Products whose variations are not colour and size only (voltage, flavour): one row each. */
export function separatedProductsNote(count: number): string {
  const amount = integer.format(count);
  const subject =
    count === 1
      ? `${amount} produto com variações entra`
      : `${amount} produtos com variações entram`;
  return `${subject} com uma linha por variação, sem grade de cores e tamanhos: as variações não são só cor e tamanho.`;
}

export function skippedProductsNote(count: number): string {
  const amount = integer.format(count);
  const subject = count === 1 ? `${amount} produto ficou` : `${amount} produtos ficaram`;
  return `${subject} de fora por não ter código no Bling ou por repetir o código de outro produto.`;
}
