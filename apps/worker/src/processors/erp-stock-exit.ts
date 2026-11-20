import {
  listErpStockExitsDue,
  markErpStockExitForTeam,
  markErpStockExitPosted,
  releaseErpStockExit,
  reserveErpStockExit,
  takeStalledErpStockExits,
  type ErpStockExitDue,
} from "@sellbridge/database/repositories";
import { isMarketplaceAuthError, isMarketplaceError } from "@sellbridge/marketplaces";
import {
  BLING_RECONNECT_MESSAGE,
  defaultBlingDepositId,
  type BlingClient,
} from "@sellbridge/marketplaces/bling";
import { userMessageOr } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { supplierBlingClient, type ErpBlingDependencies } from "./erp-bling-client.ts";

/** Sold items handled per run; the sweep runs every minute, so a backlog drains quickly. */
const BATCH_SIZE = 100;

const STALLED_PROBLEM = "O SellBridge parou no meio do envio desta saída ao Bling.";

export interface ErpStockExitSummary {
  posted: number;
  forTeam: number;
  retryLater: number;
}

/** How a failed post ends: retried later, refused for sure, or unknown (the team checks). */
type FailureKind = "not_received" | "refused" | "uncertain";

/** The access stopped working: the supplier's other exits wait for the reconnection too. */
class ConnectionLostError extends Error {}

/** Bling's rate limit answered (after the client's own retries): the supplier's other exits wait. */
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
 * may have posted the exit, so it is never sent again.
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

function whatToCheck(exit: { sku: string; externalOrderId: string; quantity: number }): string {
  const units = exit.quantity === 1 ? "1 unidade" : `${exit.quantity} unidades`;
  return `produto ${exit.sku}, pedido ${exit.externalOrderId}, ${units}`;
}

function uncertainReason(exit: { sku: string; externalOrderId: string; quantity: number }) {
  return `Não deu para saber se o Bling registrou a saída de estoque (${whatToCheck(exit)}). Confira no Bling, em Estoque desse produto, se há uma saída com a observação "SellBridge" desse pedido. Se não houver, lance a saída à mão no Bling. O SellBridge não manda de novo para não baixar duas vezes.`;
}

function refusedReason(exit: ErpStockExitDue, error: unknown): string {
  return `O Bling recusou a saída de estoque (${whatToCheck(exit)}): ${userMessageOr(error, "sem motivo")}. Nada foi baixado no Bling; lance a saída à mão no Bling depois de corrigir.`;
}

function noteFor(exit: ErpStockExitDue): string {
  return `SellBridge: venda do pedido ${exit.externalOrderId}`;
}

/** Reservations a stopped worker left half done: whether Bling posted them is unknown. */
async function reportStalledExits(dependencies: ErpBlingDependencies): Promise<number> {
  const stalled = await takeStalledErpStockExits(dependencies.database, STALLED_PROBLEM);
  for (const exit of stalled) {
    logger.error("erp.stock_exit_uncertain", {
      supplierId: exit.supplierId,
      problemKey: `erp-stock-exit:${exit.exitId}`,
      reason: uncertainReason(exit),
    });
  }
  return stalled.length;
}

async function endFailedPost(
  dependencies: ErpBlingDependencies,
  exit: ErpStockExitDue,
  exitId: string,
  error: unknown,
): Promise<keyof ErpStockExitSummary> {
  const kind = failureKindOf(error);
  if (kind === "not_received") {
    await releaseErpStockExit(dependencies.database, exitId);
    if (isReconnectError(error)) {
      throw new ConnectionLostError();
    }
    throw new RateLimitedError();
  }
  const reason = kind === "refused" ? refusedReason(exit, error) : uncertainReason(exit);
  await markErpStockExitForTeam(dependencies.database, {
    exitId,
    status: kind === "refused" ? "failed" : "uncertain",
    problem: reason,
  });
  logger.error(kind === "refused" ? "erp.stock_exit_refused" : "erp.stock_exit_uncertain", {
    supplierId: exit.supplierId,
    problemKey: `erp-stock-exit:${exitId}`,
    error,
    reason,
  });
  return "forTeam";
}

/** Reserves the item's exit, then posts it once. */
async function postOne(
  dependencies: ErpBlingDependencies,
  client: BlingClient,
  exit: ErpStockExitDue,
  depositId: number,
): Promise<keyof ErpStockExitSummary | null> {
  const exitId = await reserveErpStockExit(dependencies.database, exit);
  if (exitId === null) {
    return null;
  }
  try {
    const erpStockId = await client.postStockExit({
      erpProductId: exit.erpProductId,
      depositId,
      quantity: exit.quantity,
      note: noteFor(exit),
    });
    await markErpStockExitPosted(dependencies.database, { exitId, erpStockId });
    return "posted";
  } catch (error) {
    return endFailedPost(dependencies, exit, exitId, error);
  }
}

/** The warehouse to post from; null (and the team told) when Bling has no default one. */
async function depositFor(client: BlingClient, supplierId: string): Promise<number | null> {
  const depositId = await defaultBlingDepositId(client);
  if (depositId !== null) {
    return depositId;
  }
  logger.error("erp.stock_exit_no_deposit", {
    supplierId,
    problemKey: `erp-stock-exit-deposit:${supplierId}`,
    reason:
      "O Bling deste fornecedor tem mais de um depósito ativo e nenhum padrão, então as saídas das vendas do SellBridge não foram lançadas. Peça ao fornecedor para marcar um depósito como padrão no Bling.",
  });
  return null;
}

async function postSupplierExits(
  dependencies: ErpBlingDependencies & {
    blingCredentials: NonNullable<ErpBlingDependencies["blingCredentials"]>;
  },
  supplierId: string,
  exits: readonly ErpStockExitDue[],
): Promise<(keyof ErpStockExitSummary)[]> {
  const client = supplierBlingClient(dependencies, supplierId);
  const outcomes: (keyof ErpStockExitSummary)[] = [];
  try {
    const depositId = await depositFor(client, supplierId);
    if (depositId === null) {
      return outcomes;
    }
    for (const exit of exits) {
      const outcome = await postOne(dependencies, client, exit, depositId);
      if (outcome !== null) {
        outcomes.push(outcome);
      }
    }
  } catch (error) {
    if (error instanceof RateLimitedError) {
      logger.warn("erp.stock_exit_rate_limited", { supplierId });
      outcomes.push("retryLater");
      return outcomes;
    }
    if (error instanceof ConnectionLostError || isReconnectError(error)) {
      logger.warn("erp.stock_exit_waiting_reconnection", { supplierId });
      return outcomes;
    }
    logger.warn("erp.stock_exit_supplier_failed", { supplierId, error });
  }
  return outcomes;
}

/**
 * Posts to each supplier's Bling the stock exit of the sold items whose NF-e did not go through
 * SellBridge, once per item. Runs every minute.
 */
export async function postDueErpStockExits(
  dependencies: ErpBlingDependencies,
): Promise<ErpStockExitSummary> {
  const credentials = dependencies.blingCredentials;
  if (credentials === null) {
    return { posted: 0, forTeam: 0, retryLater: 0 };
  }
  const stalled = await reportStalledExits(dependencies);
  const due = await listErpStockExitsDue(dependencies.database, BATCH_SIZE);
  const bySupplier = new Map<string, ErpStockExitDue[]>();
  for (const exit of due) {
    const exits = bySupplier.get(exit.supplierId);
    if (exits === undefined) {
      bySupplier.set(exit.supplierId, [exit]);
      continue;
    }
    exits.push(exit);
  }
  const outcomes: (keyof ErpStockExitSummary)[] = [];
  for (const [supplierId, exits] of bySupplier) {
    outcomes.push(
      ...(await postSupplierExits(
        { ...dependencies, blingCredentials: credentials },
        supplierId,
        exits,
      )),
    );
  }
  const summary: ErpStockExitSummary = {
    posted: outcomes.filter((outcome) => outcome === "posted").length,
    forTeam: stalled + outcomes.filter((outcome) => outcome === "forTeam").length,
    retryLater: outcomes.filter((outcome) => outcome === "retryLater").length,
  };
  if (summary.posted + summary.forTeam > 0) {
    logger.info("erp.stock_exits_run", { ...summary });
  }
  return summary;
}
