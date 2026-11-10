import {
  deleteErpCatalogRead,
  deleteErpConnection,
  findErpCatalogRead,
  findErpCatalogReadProgress,
  findErpConnection,
  findSupplierProductCostsBySku,
  recordErpImport,
  startErpCatalogRead,
  type ErpCatalogRead,
} from "@sellbridge/database/repositories";
import {
  buildErpCatalogCsv,
  erpCatalogReadResultSchema,
  mergeResellerCosts,
  planErpCatalogImport,
  type ErpCatalogItem,
  type ErpCatalogReadResult,
  type ErpImportRow,
  type ErpResellerCost,
} from "@sellbridge/shared/erp-catalog";
import { conflictError, forbiddenError, validationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { database } from "@/lib/server/database";
import { enqueueErpCatalogExport, enqueueErpCatalogRead } from "@/lib/server/queues";
import {
  confirmSupplierImport,
  previewSupplierImport,
} from "@/features/supplier-panel/import/supplier-import.server";
import { blingCredentials } from "./bling-access.server";
import { blingOverviewFrom, type BlingImportOutcome, type BlingOverview } from "./bling-overview";

/** A read is kept a day: enough to come back to the import, small enough to clean itself up. */
const READ_TTL_IN_MS = 24 * 60 * 60 * 1000;
/** Rows per import file, the spreadsheet import's own limit. */
const IMPORT_CHUNK_ROWS = 1000;

const BLING = { provider: "bling" } as const;

function requireCredentials() {
  const credentials = blingCredentials();
  if (credentials === null) {
    throw conflictError("A integração com o Bling ainda não está disponível.");
  }
  return credentials;
}

export async function loadBlingOverview(supplierId: string): Promise<BlingOverview> {
  const available = blingCredentials() !== null;
  if (!available) {
    return blingOverviewFrom({ available, connection: null, read: null });
  }
  const [connection, read] = await Promise.all([
    findErpConnection(database, { supplierId, ...BLING }),
    findErpCatalogReadProgress(database, { supplierId, ...BLING }),
  ]);
  return blingOverviewFrom({ available, connection, read });
}

/** Starts reading the supplier's Bling catalog in the worker; the page follows its progress. */
export async function startBlingRead(supplierId: string): Promise<BlingOverview> {
  requireCredentials();
  const connection = await findErpConnection(database, { supplierId, ...BLING });
  if (connection?.status !== "connected") {
    throw conflictError("Conecte o Bling antes de importar os produtos.");
  }
  const read = await startErpCatalogRead(database, {
    supplierId,
    ...BLING,
    ttlMilliseconds: READ_TTL_IN_MS,
  });
  await enqueueErpCatalogRead({ supplierId, readId: read.id });
  logger.info("bling.read_started", { supplierId, readId: read.id });
  return loadBlingOverview(supplierId);
}

/** The finished read with this id, its stored result validated again. */
async function readyResult(supplierId: string, readId: string): Promise<ErpCatalogReadResult> {
  const read: ErpCatalogRead | null = await findErpCatalogRead(database, { supplierId, ...BLING });
  if (read?.id !== readId || read.status !== "ready") {
    throw conflictError("Esta leitura do Bling não está mais disponível. Importe de novo.");
  }
  const parsed = erpCatalogReadResultSchema.safeParse(read.result);
  if (!parsed.success) {
    logger.error("bling.read_result_invalid", { supplierId, readId });
    throw conflictError("Não foi possível abrir esta leitura do Bling. Importe de novo.");
  }
  return parsed.data;
}

export interface BlingReadRows {
  readonly rows: ErpImportRow[];
  readonly skipped: ErpCatalogReadResult["skipped"];
  readonly truncated: boolean;
}

/** The products of a finished read as the preview lists them, with what each one needs. */
export async function loadBlingReadRows(
  supplierId: string,
  readId: string,
): Promise<BlingReadRows> {
  const result = await readyResult(supplierId, readId);
  const existingCosts = await findSupplierProductCostsBySku(database, {
    supplierId,
    skus: result.items.map((item) => item.sku),
  });
  return {
    rows: planErpCatalogImport(result.items, existingCosts),
    skipped: result.skipped,
    truncated: result.truncated,
  };
}

/** The new products of a read as an import spreadsheet with the reseller price left blank. */
export async function buildBlingNewProductsCsv(
  supplierId: string,
  readId: string,
): Promise<string> {
  const result = await readyResult(supplierId, readId);
  const existingCosts = await findSupplierProductCostsBySku(database, {
    supplierId,
    skus: result.items.map((item) => item.sku),
  });
  const newItems = result.items.filter((item) => !existingCosts.has(item.sku));
  return buildErpCatalogCsv(newItems, new Map());
}

function chunksOf<Item>(items: readonly Item[], size: number): Item[][] {
  const chunks: Item[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

/** Joins two CSVs of the same columns, keeping the header line once. */
function appendCsvRows(collected: string, next: string): string {
  if (collected === "") {
    return next;
  }
  const lineBreak = next.indexOf("\n");
  return lineBreak === -1 ? collected : collected + next.slice(lineBreak + 1);
}

/** Previews and confirms one import file of priced products. */
async function importChunk(
  supplierId: string,
  items: readonly ErpCatalogItem[],
  costs: Map<string, number>,
) {
  const csv = buildErpCatalogCsv(items, costs);
  const preview = await previewSupplierImport({
    supplierId,
    fileName: "bling.csv",
    fileBase64: Buffer.from(csv, "utf8").toString("base64"),
  });
  const imported =
    preview.confirmation === null
      ? null
      : await confirmSupplierImport({ supplierId, ...preview.confirmation });
  return { preview, imported };
}

/**
 * Imports a finished read: products SellBridge has keep their reseller cost, new ones take the
 * prices the supplier typed, and nothing without a price is saved. Large reads go in files of
 * the spreadsheet import's size, each one previewed and confirmed by the usual rules.
 */
export async function importBlingRead(input: {
  supplierId: string;
  readId: string;
  costs: readonly ErpResellerCost[];
  resellerDiscountTenths: number | null;
}): Promise<BlingImportOutcome> {
  const { supplierId } = input;
  const result = await readyResult(supplierId, input.readId);
  const existingCosts = await findSupplierProductCostsBySku(database, {
    supplierId,
    skus: result.items.map((item) => item.sku),
  });
  const merged = mergeResellerCosts({
    items: result.items,
    existingCosts,
    typedCosts: input.costs,
  });
  if (!merged.ok) {
    throw validationError(merged.message);
  }
  const missing = result.items.filter((item) => !merged.costs.has(item.sku)).length;
  if (missing > 0) {
    throw validationError(`Faltam ${missing} preços para o revendedor antes de importar.`);
  }
  const outcome = {
    created: 0,
    updated: 0,
    pausedTargets: 0,
    synchronizationQueued: false,
    failedRows: 0,
    failedRowsCsv: "",
  };
  for (const chunk of chunksOf(result.items, IMPORT_CHUNK_ROWS)) {
    const { preview, imported } = await importChunk(supplierId, chunk, merged.costs);
    outcome.created += imported?.created ?? 0;
    outcome.updated += imported?.updated ?? 0;
    outcome.pausedTargets += imported?.pausedTargets ?? 0;
    outcome.synchronizationQueued ||= imported?.synchronizationQueued ?? false;
    outcome.failedRows += preview.failedRows;
    outcome.failedRowsCsv = appendCsvRows(outcome.failedRowsCsv, preview.failedRowsCsv);
  }
  await recordErpImport(database, {
    supplierId,
    ...BLING,
    resellerDiscountTenths: input.resellerDiscountTenths,
  });
  logger.info("bling.imported", {
    supplierId,
    created: outcome.created,
    updated: outcome.updated,
    failedRows: outcome.failedRows,
    typedCosts: input.costs.length,
  });
  return outcome;
}

/** Queues the sending of the products Bling does not have yet (worker `erp-catalog-export`). */
export async function requestBlingCatalogExport(supplierId: string): Promise<void> {
  requireCredentials();
  await enqueueErpCatalogExport({ supplierId });
}

/**
 * Forgets the supplier's Bling account; the products already imported stay as they are. A team
 * visit cannot do it, as it cannot connect it either.
 */
export async function disconnectBling(input: {
  supplierId: string;
  impersonatedBy: string | null;
}): Promise<void> {
  if (input.impersonatedBy !== null) {
    throw forbiddenError(
      "Durante a visita da equipe não dá para desconectar o Bling do fornecedor.",
    );
  }
  const deleted = await deleteErpConnection(database, { supplierId: input.supplierId, ...BLING });
  logger.info("bling.disconnected", { supplierId: input.supplierId, deleted });
}

/** Drops the finished read without importing it ("Cancelar" on the preview). */
export async function discardBlingRead(supplierId: string): Promise<void> {
  await deleteErpCatalogRead(database, { supplierId, ...BLING });
}
