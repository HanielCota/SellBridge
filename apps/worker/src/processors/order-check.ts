import {
  findConnectedStoreById,
  findStoreOrderStatuses,
  listOrderCheckStores,
  type OrderCheckStore,
} from "@sellbridge/database/repositories";
import {
  type ConnectorRegistry,
  isFinalMarketplaceAnswer,
  type MarketplaceConnector,
  type MarketplaceId,
  type MarketplaceOrder,
  type StoreCredentials,
} from "@sellbridge/marketplaces";
import { userMessageOr } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { type OrderCheckJob, QUEUE_NAMES } from "@sellbridge/shared/queues";
import {
  decryptStoreCredentials,
  expireStoreOnAuthError,
  storeRateKey,
} from "../lib/store-access.ts";
import { type OrderIntakeDependencies, saveMarketplaceOrder } from "./order-intake.ts";

/**
 * The periodic order check (docs/decisions/2026-11-19-conferencia-periodica-de-pedidos.md): every
 * 15 minutes each store's recent sales are read from its marketplace, and the ones SellBridge
 * lacks come in the way a notification brings them (`fetchOrder` and `saveMarketplaceOrder`).
 */

/** Mercado Livre keeps lost notifications two days (`missed_feeds`); the check reads as far back. */
export const ORDER_CHECK_WINDOW_IN_MS = 48 * 60 * 60 * 1000;
/** A sale this recent may still have its notification on the way: the next run looks again. */
export const NOTICE_GRACE_IN_MS = 2 * 60 * 1000;
/** Stores are checked one after the other at this pace: the marketplace quota is per app. */
export const STORE_SPACING_IN_MS = 3000;
/** Reads of 1000 sales per store and run; a store past 5000 sales in two days is reported. */
const MAX_READS_PER_STORE = 5;

/** Marketplaces checked today; Shopee and TikTok join once their order reads are confirmed. */
export const ORDER_CHECK_MARKETPLACES: readonly MarketplaceId[] = ["mercado_livre"];

/** Job name of the run that spreads the stores' checks. */
export const ORDER_CHECK_DISPATCH_JOB = "check-store-orders";

export interface OrderCheckDispatchDependencies {
  database: OrderIntakeDependencies["database"];
  connectors: ConnectorRegistry;
  /** Marketplaces the check visits; one whose connector cannot read an order by number is skipped. */
  marketplaces: readonly MarketplaceId[];
  /** Queues one store's check after a delay; a check of the store still pending is kept instead. */
  enqueue: (job: OrderCheckJob, delayInMs: number) => Promise<void>;
  now?: () => Date;
}

export interface OrderCheckDependencies extends OrderIntakeDependencies {
  connectors: ConnectorRegistry;
  /** The per-store quota every store job spends (`storeRateKey`). */
  acquireRateLimit: (key: string) => Promise<void>;
  now?: () => Date;
}

export type OrderCheckOutcome = "checked" | "store_unavailable" | "access_lost";

function checkableMarketplaces(
  dependencies: Pick<OrderCheckDispatchDependencies, "connectors" | "marketplaces">,
): MarketplaceId[] {
  return dependencies.marketplaces.filter(
    (marketplace) => dependencies.connectors[marketplace].orderResource !== undefined,
  );
}

function reportStoreWithoutAccess(
  connector: MarketplaceConnector,
  store: Pick<OrderCheckStore, "id" | "tenantId" | "shopName">,
): void {
  logger.error("store.order_check_without_access", {
    reason: `A loja ${store.shopName} (${connector.displayName}) está sem acesso: as vendas dela não são conferidas até a revendedora reconectar a loja.`,
    tenantId: store.tenantId,
    storeConnectionId: store.id,
    queue: QUEUE_NAMES.orderCheck,
    problemKey: `order-check-access:${store.id}`,
  });
}

/** Two days back, or the store's connection when newer: older sales never had a notification. */
function readStart(store: Pick<OrderCheckStore, "connectedAt">, now: Date): Date {
  const windowStart = now.getTime() - ORDER_CHECK_WINDOW_IN_MS;
  return new Date(Math.max(windowStart, store.connectedAt.getTime()));
}

/**
 * Spreads one check per connected store over the next minutes and reports the stores that lost
 * their access (expired or refused token) on the admin Problemas page, without calling them.
 */
export function createOrderCheckDispatcher(dependencies: OrderCheckDispatchDependencies) {
  return async function dispatchOrderChecks(): Promise<{ queued: number; withoutAccess: number }> {
    const now = (dependencies.now ?? (() => new Date()))();
    const stores = await listOrderCheckStores(
      dependencies.database,
      checkableMarketplaces(dependencies),
    );
    let queued = 0;
    let withoutAccess = 0;
    for (const store of stores) {
      if (store.status !== "connected" || store.accessTokenEnc === null) {
        reportStoreWithoutAccess(dependencies.connectors[store.marketplace], store);
        withoutAccess += 1;
        continue;
      }
      const job = { storeConnectionId: store.id, from: readStart(store, now).toISOString() };
      await dependencies.enqueue(job, queued * STORE_SPACING_IN_MS);
      queued += 1;
    }
    logger.info("order.check_dispatched", { queued, withoutAccess });
    return { queued, withoutAccess };
  };
}

type CheckedStore = NonNullable<Awaited<ReturnType<typeof findConnectedStoreById>>>;

interface StoreRun {
  readonly dependencies: OrderCheckDependencies;
  readonly store: CheckedStore;
  readonly connector: MarketplaceConnector;
  readonly orderResource: (externalOrderId: string) => string;
  readonly credentials: StoreCredentials;
}

/** What the check did with one sale the marketplace listed. */
type SaleOutcome = "known" | "found" | "paid_found" | "unchanged_by_check" | "refused";

async function spendStoreQuota(run: StoreRun): Promise<void> {
  await run.dependencies.acquireRateLimit(
    storeRateKey({ marketplace: run.store.marketplace, id: run.store.id }),
  );
}

/**
 * Missing here, or still waiting for payment here while the marketplace says paid: either way a
 * notification was lost, and without it the sale never reaches the supplier.
 */
function lostNoticeKind(
  sale: MarketplaceOrder,
  storedStatus: string | undefined,
): "missing" | "payment" | null {
  if (storedStatus === undefined) {
    return "missing";
  }
  if (storedStatus === "pending" && sale.status === "paid") {
    return "payment";
  }
  return null;
}

function reportFoundSale(
  run: StoreRun,
  sale: { externalOrderId: string; kind: "missing" | "payment" },
): void {
  const channel = run.connector.displayName;
  const reason =
    sale.kind === "missing"
      ? `A venda ${sale.externalOrderId} (${channel}) não entrou pelo aviso e foi trazida pela conferência periódica. Ela já está no SellBridge; se isso se repetir, os avisos do canal podem estar falhando.`
      : `O pagamento da venda ${sale.externalOrderId} (${channel}) não chegou pelo aviso; a conferência periódica atualizou a venda para paga.`;
  logger.warn("order.found_by_check", {
    reason,
    tenantId: run.store.tenantId,
    storeConnectionId: run.store.id,
    externalOrderId: sale.externalOrderId,
    queue: QUEUE_NAMES.orderCheck,
    problemKey: `order-check:${run.store.id}`,
  });
}

/**
 * Reads the sale again as a notification would and saves it. A final refusal of that one sale is
 * reported and the others go on; a failure worth retrying (rate limit, outage, token) fails the job.
 */
async function bringInSale(
  run: StoreRun,
  sale: { externalOrderId: string; kind: "missing" | "payment" },
): Promise<SaleOutcome> {
  try {
    await spendStoreQuota(run);
    const order = await run.connector.fetchOrder(
      run.credentials,
      run.orderResource(sale.externalOrderId),
    );
    const saved = await saveMarketplaceOrder(run.dependencies, run.store, order, {
      storeConnectionId: run.store.id,
    });
    if (sale.kind === "missing" && saved === "updated") {
      // The notification arrived while the check was reading: nothing was lost.
      return "unchanged_by_check";
    }
    reportFoundSale(run, sale);
    return sale.kind === "missing" ? "found" : "paid_found";
  } catch (error) {
    if (!isFinalMarketplaceAnswer(error)) {
      throw error;
    }
    logger.error("order.check_sale_refused", {
      reason: `A conferência periódica não conseguiu ler a venda ${sale.externalOrderId} (${run.connector.displayName}): ${userMessageOr(error, "o canal recusou a leitura")}. Confira a venda no painel do canal.`,
      tenantId: run.store.tenantId,
      storeConnectionId: run.store.id,
      externalOrderId: sale.externalOrderId,
      queue: QUEUE_NAMES.orderCheck,
      problemKey: `order-check-refused:${run.store.id}:${sale.externalOrderId}`,
      error,
    });
    return "refused";
  }
}

/** Compares one read of sales with the store's orders, in one query, and brings in what is lost. */
async function checkSales(
  run: StoreRun,
  sales: readonly MarketplaceOrder[],
  noticeCutoff: Date,
): Promise<SaleOutcome[]> {
  const settled = sales.filter((sale) => sale.orderedAt.getTime() <= noticeCutoff.getTime());
  const stored = await findStoreOrderStatuses(
    run.dependencies.database,
    run.store.id,
    settled.map((sale) => sale.externalOrderId),
  );
  const outcomes: SaleOutcome[] = [];
  // Sequential on purpose: every read shares one store token and its marketplace quota.
  for (const sale of settled) {
    const kind = lostNoticeKind(sale, stored.get(sale.externalOrderId));
    if (kind === null) {
      outcomes.push("known");
      continue;
    }
    outcomes.push(await bringInSale(run, { externalOrderId: sale.externalOrderId, kind }));
  }
  return outcomes;
}

/** Reads the store's sales from `from`, a thousand at a time, up to the per-run limit. */
async function checkStoreSales(run: StoreRun, from: Date, now: Date): Promise<SaleOutcome[]> {
  const noticeCutoff = new Date(now.getTime() - NOTICE_GRACE_IN_MS);
  const outcomes: SaleOutcome[] = [];
  let readFrom = from;
  for (let read = 0; read < MAX_READS_PER_STORE; read += 1) {
    await spendStoreQuota(run);
    const batch = await run.connector.listOrders(run.credentials, readFrom);
    outcomes.push(...(await checkSales(run, batch.orders, noticeCutoff)));
    if (batch.resumeFrom === null) {
      return outcomes;
    }
    if (batch.resumeFrom.getTime() <= readFrom.getTime()) {
      // A whole read of sales from one instant: starting there again would never move on.
      break;
    }
    readFrom = batch.resumeFrom;
  }
  logger.error("order.check_incomplete", {
    reason: `A conferência periódica leu até ${MAX_READS_PER_STORE * 1000} vendas da loja e parou antes do fim; as mais novas ficam para os avisos e a próxima conferência.`,
    tenantId: run.store.tenantId,
    storeConnectionId: run.store.id,
    stoppedAt: readFrom.toISOString(),
    queue: QUEUE_NAMES.orderCheck,
    problemKey: `order-check-incomplete:${run.store.id}`,
  });
  return outcomes;
}

function summarize(outcomes: readonly SaleOutcome[]): Record<SaleOutcome, number> {
  const summary: Record<SaleOutcome, number> = {
    known: 0,
    found: 0,
    paid_found: 0,
    unchanged_by_check: 0,
    refused: 0,
  };
  for (const outcome of outcomes) {
    summary[outcome] += 1;
  }
  return summary;
}

/**
 * One store's check: its sales since `job.from`, compared with what SellBridge has. A token the
 * marketplace refuses expires the store and reports it, instead of retrying.
 *
 * @throws {Error} When the store's marketplace cannot read an order by number (never dispatched).
 */
export async function checkStoreOrders(
  dependencies: OrderCheckDependencies,
  job: OrderCheckJob,
): Promise<OrderCheckOutcome> {
  const store = await findConnectedStoreById(dependencies.database, job.storeConnectionId);
  if (store === null || store.accessTokenEnc === null) {
    // Lost its access or disconnected after the run queued it: the next run reports it.
    logger.info("order.check_store_unavailable", { storeConnectionId: job.storeConnectionId });
    return "store_unavailable";
  }
  const connector = dependencies.connectors[store.marketplace];
  const orderResource = connector.orderResource;
  if (orderResource === undefined) {
    throw new Error(`The order check cannot read ${store.marketplace} orders by number`);
  }

  const now = (dependencies.now ?? (() => new Date()))();
  try {
    const credentials = decryptStoreCredentials(dependencies.cipher, {
      externalShopId: store.externalShopId,
      accessTokenEnc: store.accessTokenEnc,
    });
    const run = { dependencies, store, connector, orderResource, credentials };
    const summary = summarize(await checkStoreSales(run, new Date(job.from), now));
    logger.info("order.check_store_done", { storeConnectionId: store.id, ...summary });
    return "checked";
  } catch (error) {
    const expired = await expireStoreOnAuthError(dependencies.database, store, error);
    if (!expired) {
      throw error;
    }
    reportStoreWithoutAccess(connector, store);
    return "access_lost";
  }
}
