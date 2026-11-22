import {
  deleteResellerErpConnection,
  findBillingHolder,
  findResellerErpConnection,
  retryResellerSaleIssue,
  saveResellerSaleNoteSettings,
} from "@sellbridge/database/repositories";
import type { BlingOperation, BlingPaymentMethod } from "@sellbridge/marketplaces/bling";
import { conflictError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import {
  defaultResellerBlingSettings,
  guessPaymentMethods,
  type ResellerBlingSettings,
} from "@sellbridge/shared/reseller-bling";
import {
  blingCredentials,
  resellerBlingClient,
} from "@/features/supplier-panel/bling/bling-access.server";
import { database } from "@/lib/server/database";
import { resellerBlingSaveRefusal, type ResellerBlingSave } from "./reseller-bling-connection";

const BLING = { provider: "bling" } as const;
const VISIT_REFUSAL = "Durante a visita da equipe não dá para mudar o Bling da conta.";

/** Where the reseller's own Bling stands, as Integrações shows it. */
export type ResellerBlingStatus =
  "unavailable" | "not_company" | "not_connected" | "expired" | "connected";

export interface ResellerBlingView {
  readonly status: ResellerBlingStatus;
  /** Whether the Bling issues the sale notes of new venda à ordem parcels. */
  readonly issueFromErp: boolean;
  /** The saved settings, or the defaults with the payment methods guessed from the Bling. */
  readonly settings: ResellerBlingSettings;
  readonly operations: readonly BlingOperation[];
  readonly paymentMethods: readonly BlingPaymentMethod[];
}

function emptyView(status: ResellerBlingStatus): ResellerBlingView {
  return {
    status,
    issueFromErp: false,
    settings: defaultResellerBlingSettings(),
    operations: [],
    paymentMethods: [],
  };
}

/** Reads the reseller's connection and, when connected, what its Bling offers to choose from. */
export async function loadResellerBling(tenantId: string): Promise<ResellerBlingView> {
  const credentials = blingCredentials();
  if (credentials === null) {
    return emptyView("unavailable");
  }
  const holder = await findBillingHolder(database, tenantId);
  if ((holder?.company?.cnpj ?? null) === null) {
    return emptyView("not_company");
  }
  const connection = await findResellerErpConnection(database, { tenantId, ...BLING });
  if (connection === null) {
    return emptyView("not_connected");
  }
  if (connection.status !== "connected") {
    return emptyView("expired");
  }
  const client = resellerBlingClient(tenantId, credentials);
  const [operations, paymentMethods] = await Promise.all([
    client.listOperations(),
    client.listPaymentMethods(),
  ]);
  const guessed = {
    ...defaultResellerBlingSettings(),
    paymentMethods: guessPaymentMethods(paymentMethods),
  };
  return {
    status: "connected",
    issueFromErp: connection.saleNotesEnabledAt !== null,
    settings: connection.saleNoteSettings ?? guessed,
    operations,
    paymentMethods,
  };
}

/**
 * Saves the note's settings and whether the Bling issues the sale notes, after checking the
 * chosen operation and payment methods are active ones of the reseller's Bling.
 *
 * @throws {AppError} CONFLICT when the team is visiting, the Bling is not connected or a choice
 * is not in it.
 */
export async function saveResellerBling(input: {
  tenantId: string;
  impersonatedBy: string | null;
  save: ResellerBlingSave;
}): Promise<ResellerBlingView> {
  if (input.impersonatedBy !== null) {
    throw conflictError(VISIT_REFUSAL);
  }
  const current = await loadResellerBling(input.tenantId);
  if (current.status !== "connected") {
    throw conflictError("Conecte o seu Bling antes de salvar.");
  }
  const refusal = resellerBlingSaveRefusal(input.save, {
    operationIds: current.operations.map((operation) => operation.id),
    paymentMethodIds: current.paymentMethods.map((method) => method.id),
  });
  if (refusal !== null) {
    throw conflictError(refusal);
  }
  await saveResellerSaleNoteSettings(database, {
    tenantId: input.tenantId,
    ...BLING,
    settings: input.save.settings,
    issueFromErp: input.save.issueFromErp,
    now: new Date(),
  });
  logger.info("reseller_bling.settings_saved", {
    tenantId: input.tenantId,
    issueFromErp: input.save.issueFromErp,
  });
  return loadResellerBling(input.tenantId);
}

/** Forgets the reseller's Bling; its parcels go back to waiting for the reseller's note. */
export async function disconnectResellerBling(input: {
  tenantId: string;
  impersonatedBy: string | null;
}): Promise<void> {
  if (input.impersonatedBy !== null) {
    throw conflictError(VISIT_REFUSAL);
  }
  await deleteResellerErpConnection(database, { tenantId: input.tenantId, ...BLING });
  logger.info("reseller_bling.disconnected", { tenantId: input.tenantId });
}

/** Puts a sale note the reseller's Bling stopped on back in line. */
export async function retryResellerSaleNote(input: {
  tenantId: string;
  shipmentId: string;
}): Promise<void> {
  await retryResellerSaleIssue(database, { ...input, now: new Date() });
  logger.info("reseller_invoice.issue_retried", input);
}
