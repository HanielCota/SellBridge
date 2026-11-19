import {
  applyErpStockReadings,
  claimErpStockRefreshRequests,
  deleteErpStockRefreshRequestsBefore,
  findErpStockAccount,
  linkErpProducts,
  listErpStockAccounts,
  listLinkedErpProductIds,
  listUnlinkedErpSkus,
  recordErpStockCheckFailure,
  recordErpStockCheckSuccess,
  saveErpCompanyId,
  unlinkAllErpProducts,
  unlinkErpProducts,
  type ErpStockAccount,
  type ErpStockChange,
} from "@sellbridge/database/repositories";
import { isMarketplaceAuthError } from "@sellbridge/marketplaces";
import {
  BLING_RECONNECT_MESSAGE,
  BLING_STOCK_BATCH_LIMIT,
  findBlingIdsBySku,
  readBlingStock,
  type BlingClient,
  type BlingStockRead,
} from "@sellbridge/marketplaces/bling";
import { userMessageOr } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { supplierBlingClient, type ErpBlingDependencies } from "./erp-bling-client.ts";

export interface ErpStockSyncDependencies extends ErpBlingDependencies {
  /** Asks the marketplace sync to push the new stock to the resellers' listings. */
  readonly requestListingSync: () => Promise<void>;
  /** Queues one supplier's full check (the periodic round fans out through this). */
  readonly enqueueSupplierCheck: (supplierId: string) => Promise<void>;
  readonly now?: () => Date;
}

/** From the third failed check in a row, the team sees it on the Problemas page. */
const FAILURES_BEFORE_ALERT = 3;

/** Corrections found by the check while Bling sent no notice for this long mean notices are off. */
const NOTICE_SILENCE_IN_MS = 24 * 60 * 60 * 1000;

const PAGE_SIZE = 500;

export type ErpStockOutcome = "synced" | "skipped" | "connection_lost" | "failed";

function nowOf(dependencies: ErpStockSyncDependencies): Date {
  return dependencies.now?.() ?? new Date();
}

function isReconnectError(error: unknown): boolean {
  if (isMarketplaceAuthError(error)) {
    return true;
  }
  return error instanceof Error && error.message === BLING_RECONNECT_MESSAGE;
}

function clientFor(dependencies: ErpStockSyncDependencies, supplierId: string): BlingClient | null {
  const credentials = dependencies.blingCredentials;
  if (credentials === null) {
    return null;
  }
  return supplierBlingClient({ ...dependencies, blingCredentials: credentials }, supplierId);
}

/** Every SKU of the supplier not linked yet, looked up in Bling 100 at a time. */
async function linkProductsBySku(
  dependencies: ErpStockSyncDependencies,
  client: BlingClient,
  supplierId: string,
): Promise<void> {
  let afterSku: string | null = null;
  for (;;) {
    const skus = await listUnlinkedErpSkus(dependencies.database, {
      supplierId,
      afterSku,
      limit: PAGE_SIZE,
    });
    if (skus.length === 0) {
      return;
    }
    const links = await findBlingIdsBySku(client, skus);
    await linkErpProducts(dependencies.database, { supplierId, links });
    afterSku = skus.at(-1) ?? null;
  }
}

async function allLinkedIds(
  dependencies: ErpStockSyncDependencies,
  supplierId: string,
): Promise<number[]> {
  const ids: number[] = [];
  let afterId: number | null = null;
  for (;;) {
    const page = await listLinkedErpProductIds(dependencies.database, {
      supplierId,
      afterId,
      limit: PAGE_SIZE,
    });
    ids.push(...page);
    if (page.length < PAGE_SIZE) {
      return ids;
    }
    afterId = page.at(-1) ?? null;
  }
}

/** A different Bling company than the one linked before means other ids: they are linked again. */
async function syncCompany(
  dependencies: ErpStockSyncDependencies,
  client: BlingClient,
  account: ErpStockAccount,
): Promise<void> {
  const companyId = await client.getCompanyId();
  if (companyId === account.erpCompanyId) {
    return;
  }
  if (account.erpCompanyId !== null) {
    logger.info("erp.stock_company_changed", { supplierId: account.supplierId });
    await unlinkAllErpProducts(dependencies.database, account.supplierId);
  }
  await saveErpCompanyId(dependencies.database, {
    connectionId: account.connectionId,
    erpCompanyId: companyId,
  });
}

function reportShortages(supplierId: string, changes: readonly ErpStockChange[]): void {
  for (const change of changes) {
    if (change.stock >= change.reservedStock) {
      continue;
    }
    logger.error("erp.stock_below_reserved", {
      supplierId,
      productId: change.productId,
      problemKey: `erp-stock-short:${change.productId}`,
      reason: `O Bling do fornecedor ficou com ${change.stock} unidade(s) do SKU ${change.sku}, mas ${change.reservedStock} já foram vendidas pelo SellBridge e esperam envio. Confira com o fornecedor se ele consegue enviar.`,
    });
  }
}

/** Saves what Bling answered and pushes any change to the listings. */
async function applyRead(
  dependencies: ErpStockSyncDependencies,
  supplierId: string,
  read: BlingStockRead,
  readAt: Date,
): Promise<ErpStockChange[]> {
  const { database } = dependencies;
  const links = read.readings.flatMap((reading) =>
    reading.sku === null ? [] : [{ sku: reading.sku, erpProductId: reading.erpProductId }],
  );
  await linkErpProducts(database, { supplierId, links });
  await unlinkErpProducts(database, { supplierId, erpProductIds: read.missing });
  const changes = await applyErpStockReadings(database, {
    supplierId,
    readAt,
    readings: read.readings,
  });
  if (changes.length > 0) {
    logger.info("erp.stock_updated", { supplierId, changed: changes.length });
    reportShortages(supplierId, changes);
    await dependencies.requestListingSync();
  }
  return changes;
}

/** Corrections without a recent notice: Bling's stock notices are not reaching SellBridge. */
function reportMissingNotices(account: ErpStockAccount, corrected: number, checkedAt: Date): void {
  if (corrected === 0 || account.stockCheckedAt === null) {
    return;
  }
  const lastNotice = account.lastStockNoticeAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  if (checkedAt.getTime() - lastNotice < NOTICE_SILENCE_IN_MS) {
    return;
  }
  logger.error("erp.stock_notices_missing", {
    supplierId: account.supplierId,
    corrected,
    problemKey: `erp-stock-notices:${account.supplierId}`,
    reason:
      "A conferência do estoque do Bling corrigiu produtos, mas nenhum aviso de estoque do Bling chegou nas últimas 24 horas. Confira no aplicativo do Bling (aba Webhooks) se o recurso Estoque está ligado e apontando para o SellBridge.",
  });
}

async function recordFailure(
  dependencies: ErpStockSyncDependencies,
  account: ErpStockAccount,
  error: unknown,
): Promise<ErpStockOutcome> {
  if (isReconnectError(error)) {
    logger.error("erp.stock_connection_lost", {
      supplierId: account.supplierId,
      problemKey: `erp-stock-connection:${account.supplierId}`,
      reason:
        "O estoque deste fornecedor parou de acompanhar o Bling: a conexão com o Bling expirou. O fornecedor precisa conectar o Bling de novo no painel (Importar produtos).",
    });
    return "connection_lost";
  }
  const failures = await recordErpStockCheckFailure(dependencies.database, account.connectionId);
  if (failures < FAILURES_BEFORE_ALERT) {
    logger.warn("erp.stock_check_retry_later", { supplierId: account.supplierId, failures, error });
    return "failed";
  }
  logger.error("erp.stock_check_failed", {
    supplierId: account.supplierId,
    failures,
    error,
    problemKey: `erp-stock-check:${account.supplierId}`,
    reason: `A conferência do estoque do Bling falhou ${failures} vezes seguidas para este fornecedor: ${userMessageOr(error, "erro desconhecido")}`,
  });
  return "failed";
}

async function runFullCheck(
  dependencies: ErpStockSyncDependencies,
  client: BlingClient,
  account: ErpStockAccount,
): Promise<void> {
  const { database } = dependencies;
  const { supplierId } = account;
  const startedAt = nowOf(dependencies);
  await syncCompany(dependencies, client, account);
  await linkProductsBySku(dependencies, client, supplierId);
  const read = await readBlingStock(client, await allLinkedIds(dependencies, supplierId));
  const changes = await applyRead(dependencies, supplierId, read, startedAt);
  await deleteErpStockRefreshRequestsBefore(database, { supplierId, before: startedAt });
  await recordErpStockCheckSuccess(database, {
    connectionId: account.connectionId,
    checkedAt: startedAt,
  });
  reportMissingNotices(account, changes.length, startedAt);
}

/** Reads every linked product of one supplier (the safety net for lost notices). */
export async function checkSupplierErpStock(
  dependencies: ErpStockSyncDependencies,
  supplierId: string,
): Promise<ErpStockOutcome> {
  const account = await findErpStockAccount(dependencies.database, supplierId);
  const client = clientFor(dependencies, supplierId);
  if (account === null || client === null) {
    return "skipped";
  }
  try {
    await runFullCheck(dependencies, client, account);
    return "synced";
  } catch (error) {
    return recordFailure(dependencies, account, error);
  }
}

/** Reads the products Bling notified about, 100 at a time, until none is pending. */
export async function refreshSupplierErpStock(
  dependencies: ErpStockSyncDependencies,
  supplierId: string,
): Promise<ErpStockOutcome> {
  const account = await findErpStockAccount(dependencies.database, supplierId);
  const client = clientFor(dependencies, supplierId);
  if (account === null || client === null) {
    return "skipped";
  }
  try {
    for (;;) {
      const ids = await claimErpStockRefreshRequests(dependencies.database, {
        supplierId,
        limit: BLING_STOCK_BATCH_LIMIT,
      });
      if (ids.length === 0) {
        return "synced";
      }
      const readAt = nowOf(dependencies);
      await applyRead(dependencies, supplierId, await readBlingStock(client, ids), readAt);
    }
  } catch (error) {
    if (isReconnectError(error)) {
      return recordFailure(dependencies, account, error);
    }
    // The claimed reads are gone; the next full check (at most 15 minutes away) reads them.
    logger.warn("erp.stock_refresh_failed", { supplierId, error });
    return "failed";
  }
}

/** The periodic round: one full check per supplier whose stock follows Bling. */
export async function checkAllErpStock(dependencies: ErpStockSyncDependencies): Promise<number> {
  const accounts = await listErpStockAccounts(dependencies.database);
  for (const account of accounts) {
    await dependencies.enqueueSupplierCheck(account.supplierId);
  }
  return accounts.length;
}
