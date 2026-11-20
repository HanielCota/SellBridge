import {
  listErpStockEntriesDue,
  listErpStockExitsDue,
  markErpStockExitForTeam,
  markErpStockExitPosted,
  releaseErpStockExit,
  reserveErpStockExit,
  takeStalledErpStockExits,
  type ErpStockExitDue,
} from "@sellbridge/database/repositories";
import type { Database } from "@sellbridge/database/client";
import { isMarketplaceAuthError, isMarketplaceError } from "@sellbridge/marketplaces";
import {
  BLING_RECONNECT_MESSAGE,
  defaultBlingDepositId,
  type BlingClient,
  type BlingStockMovement,
} from "@sellbridge/marketplaces/bling";
import { userMessageOr } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { supplierBlingClient, type ErpBlingDependencies } from "./erp-bling-client.ts";

/** Items handled per run; the sweep runs every minute, so a backlog drains quickly. */
const BATCH_SIZE = 100;

export interface ErpStockExitSummary {
  posted: number;
  forTeam: number;
  retryLater: number;
}

interface MovementSubject {
  sku: string;
  externalOrderId: string;
  quantity: number;
}

/**
 * What differs between a sale's exit and its return's entry: what is due, the Bling call, and the
 * words the team and the supplier read. The reservation, the single post and the failure rules
 * are the same for both.
 */
interface StockMovementKind {
  readonly operation: "exit" | "entry";
  /** Prefix of the log events, which the Problemas page keeps. */
  readonly event: "erp.stock_exit" | "erp.stock_entry";
  readonly runEvent: "erp.stock_exits_run" | "erp.stock_entries_run";
  readonly listDue: (database: Database, limit: number) => Promise<ErpStockExitDue[]>;
  readonly post: (client: BlingClient, movement: BlingStockMovement) => Promise<number>;
  readonly note: (movement: ErpStockExitDue) => string;
  readonly stalledProblem: string;
  readonly uncertainReason: (movement: MovementSubject) => string;
  readonly refusedReason: (movement: MovementSubject, cause: string) => string;
  readonly noDepositReason: string;
}

function whatToCheck(movement: MovementSubject): string {
  const units = movement.quantity === 1 ? "1 unidade" : `${movement.quantity} unidades`;
  return `produto ${movement.sku}, pedido ${movement.externalOrderId}, ${units}`;
}

const SALE_EXIT: StockMovementKind = {
  operation: "exit",
  event: "erp.stock_exit",
  runEvent: "erp.stock_exits_run",
  listDue: listErpStockExitsDue,
  post: async (client, movement) => client.postStockExit(movement),
  note: (movement) => `SellBridge: venda do pedido ${movement.externalOrderId}`,
  stalledProblem: "O SellBridge parou no meio do envio desta saída ao Bling.",
  uncertainReason: (movement) =>
    `Não deu para saber se o Bling registrou a saída de estoque (${whatToCheck(movement)}). Confira no Bling, em Estoque desse produto, se há uma saída com a observação "SellBridge" desse pedido. Se não houver, lance a saída à mão no Bling. O SellBridge não manda de novo para não baixar duas vezes.`,
  refusedReason: (movement, cause) =>
    `O Bling recusou a saída de estoque (${whatToCheck(movement)}): ${cause}. Nada foi baixado no Bling; lance a saída à mão no Bling depois de corrigir.`,
  noDepositReason:
    "O Bling deste fornecedor tem mais de um depósito ativo e nenhum padrão, então as saídas das vendas do SellBridge não foram lançadas. Peça ao fornecedor para marcar um depósito como padrão no Bling.",
};

const RETURN_ENTRY: StockMovementKind = {
  operation: "entry",
  event: "erp.stock_entry",
  runEvent: "erp.stock_entries_run",
  listDue: listErpStockEntriesDue,
  post: async (client, movement) => client.postStockEntry(movement),
  note: (movement) => `SellBridge: devolução do pedido ${movement.externalOrderId}`,
  stalledProblem: "O SellBridge parou no meio do envio desta entrada de devolução ao Bling.",
  uncertainReason: (movement) =>
    `Não deu para saber se o Bling registrou a entrada de estoque da devolução (${whatToCheck(movement)}). Confira no Bling, em Estoque desse produto, se há uma entrada com a observação "SellBridge" desse pedido. Se não houver, lance a entrada à mão no Bling. O SellBridge não manda de novo para não somar duas vezes.`,
  refusedReason: (movement, cause) =>
    `O Bling recusou a entrada de estoque da devolução (${whatToCheck(movement)}): ${cause}. Nada entrou no Bling; lance a entrada à mão no Bling depois de corrigir, ou as unidades devolvidas somem do estoque na próxima conferência.`,
  noDepositReason:
    "O Bling deste fornecedor tem mais de um depósito ativo e nenhum padrão, então as entradas das devoluções do SellBridge não foram lançadas. Peça ao fornecedor para marcar um depósito como padrão no Bling.",
};

/** How a failed post ends: retried later, refused for sure, or unknown (the team checks). */
type FailureKind = "not_received" | "refused" | "uncertain";

/** The access stopped working: the supplier's other movements wait for the reconnection too. */
class ConnectionLostError extends Error {}

/** Bling's rate limit answered (after the client's own retries): the supplier's others wait. */
class RateLimitedError extends Error {}

function statusOf(error: unknown): number | null {
  if (!isMarketplaceError(error)) {
    return null;
  }
  const status = error.details.status;
  return typeof status === "number" ? status : null;
}

function isReconnectError(error: unknown): boolean {
  if (isMarketplaceAuthError(error)) {
    return true;
  }
  return error instanceof Error && error.message === BLING_RECONNECT_MESSAGE;
}

/**
 * Only a refusal Bling surely did not act on is retried: the access was refused (nothing ran)
 * or the rate limit answered. A 4xx is a refusal; anything else (timeout, 5xx, a lost answer)
 * may have posted the movement, so it is never sent again.
 */
function failureKindOf(error: unknown): FailureKind {
  const status = statusOf(error);
  if (isReconnectError(error) || status === 429) {
    return "not_received";
  }
  if (status !== null && status >= 400 && status < 500) {
    return "refused";
  }
  return "uncertain";
}

/** Reservations a stopped worker left half done: whether Bling posted them is unknown. */
async function reportStalled(
  dependencies: ErpBlingDependencies,
  kind: StockMovementKind,
): Promise<number> {
  const stalled = await takeStalledErpStockExits(dependencies.database, {
    operation: kind.operation,
    problem: kind.stalledProblem,
  });
  for (const movement of stalled) {
    logger.error(`${kind.event}_uncertain`, {
      supplierId: movement.supplierId,
      problemKey: `erp-stock-${kind.operation}:${movement.exitId}`,
      reason: kind.uncertainReason(movement),
    });
  }
  return stalled.length;
}

async function endFailedPost(
  dependencies: ErpBlingDependencies,
  kind: StockMovementKind,
  movement: ErpStockExitDue & { rowId: string },
  error: unknown,
): Promise<keyof ErpStockExitSummary> {
  const failure = failureKindOf(error);
  if (failure === "not_received") {
    await releaseErpStockExit(dependencies.database, movement.rowId);
    if (isReconnectError(error)) {
      throw new ConnectionLostError();
    }
    throw new RateLimitedError();
  }
  const reason =
    failure === "refused"
      ? kind.refusedReason(movement, userMessageOr(error, "sem motivo"))
      : kind.uncertainReason(movement);
  await markErpStockExitForTeam(dependencies.database, {
    exitId: movement.rowId,
    status: failure === "refused" ? "failed" : "uncertain",
    problem: reason,
  });
  logger.error(failure === "refused" ? `${kind.event}_refused` : `${kind.event}_uncertain`, {
    supplierId: movement.supplierId,
    problemKey: `erp-stock-${kind.operation}:${movement.rowId}`,
    error,
    reason,
  });
  return "forTeam";
}

/** Reserves the item's movement, then posts it once. */
async function postOne(
  dependencies: ErpBlingDependencies,
  kind: StockMovementKind,
  client: BlingClient,
  movement: ErpStockExitDue & { depositId: number },
): Promise<keyof ErpStockExitSummary | null> {
  const rowId = await reserveErpStockExit(dependencies.database, movement, kind.operation);
  if (rowId === null) {
    return null;
  }
  try {
    const erpStockId = await kind.post(client, {
      erpProductId: movement.erpProductId,
      depositId: movement.depositId,
      quantity: movement.quantity,
      note: kind.note(movement),
    });
    await markErpStockExitPosted(dependencies.database, { exitId: rowId, erpStockId });
    return "posted";
  } catch (error) {
    return endFailedPost(dependencies, kind, { ...movement, rowId }, error);
  }
}

/** The warehouse to post to; null (and the team told) when Bling has no default one. */
async function depositFor(
  client: BlingClient,
  kind: StockMovementKind,
  supplierId: string,
): Promise<number | null> {
  const depositId = await defaultBlingDepositId(client);
  if (depositId !== null) {
    return depositId;
  }
  logger.error(`${kind.event}_no_deposit`, {
    supplierId,
    problemKey: `erp-stock-${kind.operation}-deposit:${supplierId}`,
    reason: kind.noDepositReason,
  });
  return null;
}

async function postSupplierMovements(
  dependencies: ErpBlingDependencies & {
    blingCredentials: NonNullable<ErpBlingDependencies["blingCredentials"]>;
  },
  kind: StockMovementKind,
  supplierId: string,
  movements: readonly ErpStockExitDue[],
): Promise<(keyof ErpStockExitSummary)[]> {
  const client = supplierBlingClient(dependencies, supplierId);
  const outcomes: (keyof ErpStockExitSummary)[] = [];
  try {
    const depositId = await depositFor(client, kind, supplierId);
    if (depositId === null) {
      return outcomes;
    }
    for (const movement of movements) {
      const outcome = await postOne(dependencies, kind, client, { ...movement, depositId });
      if (outcome !== null) {
        outcomes.push(outcome);
      }
    }
  } catch (error) {
    if (error instanceof RateLimitedError) {
      logger.warn(`${kind.event}_rate_limited`, { supplierId });
      outcomes.push("retryLater");
      return outcomes;
    }
    if (error instanceof ConnectionLostError || isReconnectError(error)) {
      logger.warn(`${kind.event}_waiting_reconnection`, { supplierId });
      return outcomes;
    }
    logger.warn(`${kind.event}_supplier_failed`, { supplierId, error });
  }
  return outcomes;
}

function groupBySupplier(movements: readonly ErpStockExitDue[]) {
  const bySupplier = new Map<string, ErpStockExitDue[]>();
  for (const movement of movements) {
    const group = bySupplier.get(movement.supplierId);
    if (group === undefined) {
      bySupplier.set(movement.supplierId, [movement]);
      continue;
    }
    group.push(movement);
  }
  return bySupplier;
}

async function postDueMovements(
  dependencies: ErpBlingDependencies,
  kind: StockMovementKind,
): Promise<ErpStockExitSummary> {
  const credentials = dependencies.blingCredentials;
  if (credentials === null) {
    return { posted: 0, forTeam: 0, retryLater: 0 };
  }
  const stalled = await reportStalled(dependencies, kind);
  const due = await kind.listDue(dependencies.database, BATCH_SIZE);
  const outcomes: (keyof ErpStockExitSummary)[] = [];
  for (const [supplierId, movements] of groupBySupplier(due)) {
    outcomes.push(
      ...(await postSupplierMovements(
        { ...dependencies, blingCredentials: credentials },
        kind,
        supplierId,
        movements,
      )),
    );
  }
  const summary: ErpStockExitSummary = {
    posted: outcomes.filter((outcome) => outcome === "posted").length,
    forTeam: stalled + outcomes.filter((outcome) => outcome === "forTeam").length,
    retryLater: outcomes.filter((outcome) => outcome === "retryLater").length,
  };
  if (summary.posted + summary.forTeam > 0) {
    logger.info(kind.runEvent, { ...summary });
  }
  return summary;
}

/**
 * Posts to each supplier's Bling the stock exit of the sold items whose NF-e did not go through
 * SellBridge, once per item. Runs every minute.
 */
export async function postDueErpStockExits(
  dependencies: ErpBlingDependencies,
): Promise<ErpStockExitSummary> {
  return postDueMovements(dependencies, SALE_EXIT);
}

/**
 * Posts to each supplier's Bling the stock entry of the returned items put back on its shelf,
 * reversing the exit SellBridge posted for their sale, once per item. Without it, Bling's balance
 * would wipe the returned units from SellBridge on the next stock check. Runs every minute.
 */
export async function postDueErpStockEntries(
  dependencies: ErpBlingDependencies,
): Promise<ErpStockExitSummary> {
  return postDueMovements(dependencies, RETURN_ENTRY);
}
