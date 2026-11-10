import {
  claimDueShipmentInvoices,
  loadShipmentInvoiceWork,
  markShipmentInvoiceAttention,
  queueNewShipmentInvoices,
  scheduleShipmentInvoiceRetry,
  type ShipmentInvoiceWork,
} from "@sellbridge/database/repositories";
import { isMarketplaceError, isRetryableError, type BuyerBilling } from "@sellbridge/marketplaces";
import { BLING_RECONNECT_MESSAGE, type BlingAppCredentials } from "@sellbridge/marketplaces/bling";
import { hasErrorCode } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import {
  MAX_INVOICE_ATTEMPTS,
  MissingInvoiceDataError,
  nextInvoiceAttemptAt,
} from "@sellbridge/shared/supplier-invoice";
import { supplierBlingClient, type ErpBlingDependencies } from "./erp-bling-client.ts";
import { advanceInvoice, InvoiceStopError } from "./erp-invoice-steps.ts";

export interface ErpInvoiceDependencies extends ErpBlingDependencies {
  /** The buyer's CPF or CNPJ from the sales channel; null when the channel gives none. */
  readonly readBuyerBilling: (work: ShipmentInvoiceWork) => Promise<BuyerBilling | null>;
  readonly now?: () => Date;
}

export interface ErpInvoiceSummary {
  queued: number;
  processed: number;
}

/** Notes taken per run; the job runs every few minutes and Bling allows 3 calls a second. */
const INVOICES_PER_RUN = 20;
/** A run that crashed leaves its notes to the next run after this long. */
const CLAIM_LEASE_IN_MS = 10 * 60_000;

const RECONNECT_PROBLEM = `O Bling foi desconectado. ${BLING_RECONNECT_MESSAGE} Depois, peça para tentar de novo.`;
const TOO_MANY_ATTEMPTS_PROBLEM =
  "O Bling não respondeu depois de várias tentativas. Confira se o Bling está no ar e tente de novo.";

function missingDataProblem(sku: string): string {
  return `Falta o NCM do produto ${sku}. Preencha em Produtos e peça para tentar de novo.`;
}

function refusalProblem(error: unknown): string {
  const issues: unknown = isMarketplaceError(error) ? Reflect.get(error.details, "issues") : null;
  if (Array.isArray(issues) && issues.length > 0) {
    return `O Bling recusou a nota: ${issues.map(String).join(" ")}`;
  }
  return "O Bling recusou a nota. Abra o pedido no Bling para ver o motivo, corrija e peça para tentar de novo.";
}

/** A stop of ours (missing data, wrong CFOP) rather than a failure of Bling or the channel. */
function isSupplierStop(error: unknown): boolean {
  return error instanceof InvoiceStopError || error instanceof MissingInvoiceDataError;
}

/** Whether the failure means the supplier's Bling connection is gone (refused refresh). */
function isLostConnection(error: unknown): boolean {
  return hasErrorCode(error, "CONFLICT") && error.userMessage === BLING_RECONNECT_MESSAGE;
}

/** What a failed step leaves: a stop the supplier must act on, or a retry later. */
async function recordFailure(
  dependencies: ErpInvoiceDependencies,
  work: ShipmentInvoiceWork,
  error: unknown,
): Promise<void> {
  const { database } = dependencies;
  const invoiceId = work.id;
  if (error instanceof InvoiceStopError) {
    await markShipmentInvoiceAttention(database, { invoiceId, problem: error.problem });
    return;
  }
  if (error instanceof MissingInvoiceDataError) {
    await markShipmentInvoiceAttention(database, {
      invoiceId,
      problem: missingDataProblem(error.sku),
    });
    return;
  }
  if (isLostConnection(error)) {
    await markShipmentInvoiceAttention(database, { invoiceId, problem: RECONNECT_PROBLEM });
    return;
  }
  if (!isRetryableError(error)) {
    await markShipmentInvoiceAttention(database, { invoiceId, problem: refusalProblem(error) });
    return;
  }
  const attempts = work.attempts + 1;
  if (attempts >= MAX_INVOICE_ATTEMPTS) {
    await markShipmentInvoiceAttention(database, { invoiceId, problem: TOO_MANY_ATTEMPTS_PROBLEM });
    return;
  }
  const now = dependencies.now?.() ?? new Date();
  await scheduleShipmentInvoiceRetry(database, {
    invoiceId,
    attempts,
    retryAt: nextInvoiceAttemptAt(attempts, now),
  });
}

async function processOne(
  dependencies: ErpInvoiceDependencies & { blingCredentials: BlingAppCredentials },
  invoiceId: string,
): Promise<void> {
  const work = await loadShipmentInvoiceWork(dependencies.database, invoiceId);
  if (work === null) {
    return;
  }
  try {
    const client = supplierBlingClient(dependencies, work.supplierId);
    await advanceInvoice({ ...dependencies, client }, work);
  } catch (error) {
    logger.warn("erp.invoice_step_failed", {
      invoiceId,
      supplierId: work.supplierId,
      stopped: isSupplierStop(error),
      error,
    });
    await recordFailure(dependencies, work, error);
  }
}

/**
 * Issues, through each supplier's Bling, the NF-e of new parcels of suppliers who turned it on,
 * and follows the notes waiting for SEFAZ. Does nothing while the Bling app keys are unset.
 */
export function createErpInvoiceProcessor(dependencies: ErpInvoiceDependencies) {
  return async function processErpInvoices(): Promise<ErpInvoiceSummary> {
    const credentials = dependencies.blingCredentials;
    if (credentials === null) {
      return { queued: 0, processed: 0 };
    }
    const queued = await queueNewShipmentInvoices(dependencies.database);
    const now = dependencies.now?.() ?? new Date();
    const ids = await claimDueShipmentInvoices(dependencies.database, {
      now,
      limit: INVOICES_PER_RUN,
      leaseMilliseconds: CLAIM_LEASE_IN_MS,
    });
    // One at a time: a supplier's Bling quota is per account, and most runs carry a few notes.
    for (const invoiceId of ids) {
      await processOne({ ...dependencies, blingCredentials: credentials }, invoiceId);
    }
    return { queued, processed: ids.length };
  };
}
