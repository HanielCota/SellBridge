import type { Database } from "@sellbridge/database";
import {
  claimDueResellerSaleInvoices,
  queueResellerSaleInvoices,
  recordMarketplaceResellerSaleInvoice,
  scheduleResellerSaleInvoiceCheck,
  type DueResellerSaleInvoice,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import {
  issueResellerSaleInvoice,
  type ResellerSaleIssueDependencies,
} from "./reseller-sale-issue.ts";
import { parseAccessKey, resellerAccessKeyProblem } from "@sellbridge/shared/nfe-access-key";
import {
  nextResellerInvoiceCheckAt,
  type MarketplaceSaleInvoice,
} from "@sellbridge/shared/reseller-invoice";

export interface ResellerInvoiceReadDependencies {
  readonly database: Database;
  /** The note attached to the marketplace's order; null when there is none or no channel reads it. */
  readonly readSaleInvoice: (due: DueResellerSaleInvoice) => Promise<MarketplaceSaleInvoice | null>;
  /** Issues the note on the reseller's own Bling when the reseller turned that on. */
  readonly issue?: ResellerSaleIssueDependencies;
  readonly now?: () => Date;
}

export interface ResellerInvoiceReadSummary {
  queued: number;
  checked: number;
  found: number;
}

/** Notes read per run; the job runs every few minutes and each read costs two marketplace calls. */
const NOTES_PER_RUN = 50;
/** A run that crashed leaves its notes to the next run after this long. */
const CLAIM_LEASE_IN_MS = 10 * 60_000;

const NOT_A_COMPANY =
  "Cadastre o CNPJ da sua empresa em Meu cadastro: a nota de venda sai no nome dela.";

function marketplaceNoteProblem(problem: string): string {
  return `A nota anexada ao pedido no marketplace não serve. ${problem}`;
}

type ReadOutcome =
  { kind: "found"; invoice: MarketplaceSaleInvoice } | { kind: "missing"; problem: string | null };

async function readOne(
  dependencies: ResellerInvoiceReadDependencies,
  due: DueResellerSaleInvoice,
): Promise<ReadOutcome> {
  if (due.resellerCnpj === null) {
    return { kind: "missing", problem: NOT_A_COMPANY };
  }
  const invoice = await dependencies.readSaleInvoice(due);
  if (invoice === null) {
    return { kind: "missing", problem: null };
  }
  const problem = resellerAccessKeyProblem(invoice.accessKey, due.resellerCnpj);
  if (problem !== null) {
    return { kind: "missing", problem: marketplaceNoteProblem(problem) };
  }
  return { kind: "found", invoice };
}

/** Reads one note and saves what came of it; a failed read is tried again at the next check. */
async function checkOne(
  dependencies: ResellerInvoiceReadDependencies,
  due: DueResellerSaleInvoice,
  now: Date,
): Promise<boolean> {
  const checks = due.checks + 1;
  const next = { invoiceId: due.id, checks, nextCheckAt: nextResellerInvoiceCheckAt(checks, now) };
  try {
    const outcome = await readOne(dependencies, due);
    const parts = outcome.kind === "found" ? parseAccessKey(outcome.invoice.accessKey) : null;
    if (outcome.kind === "found" && parts !== null) {
      await recordMarketplaceResellerSaleInvoice(dependencies.database, {
        invoiceId: due.id,
        parts,
        issuedAt: outcome.invoice.issuedAt,
        now,
      });
      return true;
    }
    const problem = outcome.kind === "missing" ? outcome.problem : null;
    await scheduleResellerSaleInvoiceCheck(dependencies.database, { ...next, problem });
    return false;
  } catch (error) {
    logger.warn("reseller_invoice.read_failed", {
      invoiceId: due.id,
      storeId: due.store.id,
      error,
    });
    await scheduleResellerSaleInvoiceCheck(dependencies.database, { ...next, problem: null });
    return false;
  }
}

/**
 * Opens the reseller's sale note of new venda à ordem parcels and looks for it on the
 * marketplace's order until it is there (or the reseller types its key). When the reseller's own
 * Bling issues the note, it is issued there instead.
 */
export function createResellerInvoiceReadProcessor(dependencies: ResellerInvoiceReadDependencies) {
  return async function readResellerInvoices(): Promise<ResellerInvoiceReadSummary> {
    const queued = await queueResellerSaleInvoices(dependencies.database);
    const now = dependencies.now?.() ?? new Date();
    const due = await claimDueResellerSaleInvoices(dependencies.database, {
      now,
      limit: NOTES_PER_RUN,
      leaseMilliseconds: CLAIM_LEASE_IN_MS,
    });
    let found = 0;
    // One at a time: the reads share each store's marketplace quota.
    for (const note of due) {
      const issue = dependencies.issue;
      const done =
        note.issuesFromErp && issue !== undefined
          ? await issueResellerSaleInvoice(issue, note, now)
          : await checkOne(dependencies, note, now);
      if (done) {
        found += 1;
      }
    }
    return { queued, checked: due.length, found };
  };
}
