import type { Database } from "@sellbridge/database";
import {
  findSupplierPaymentAccount,
  listHeldPayments,
  listShipmentPaymentsToReconcile,
  markShipmentPaymentChecked,
  type HeldPayment,
  type ShipmentPayment,
  type SupplierPaymentAccount,
} from "@sellbridge/database/repositories";
import {
  AsaasAccountUnavailableError,
  isAsaasError,
  reconcileAsaasParcel,
  settleHeldPayment,
  syncAsaasCharge,
  type AsaasContext,
  type HeldMoneyOutcome,
  type AsaasSettings,
} from "@sellbridge/payments/asaas";
import { logger } from "@sellbridge/shared/logger";
import type { TokenCipher } from "@sellbridge/shared/token-cipher";
import { RECHECK_UNPAID_FOR_IN_MS, SUPPLIER_PAYMENT_BATCH } from "./supplier-payments.ts";

export interface AsaasPaymentDependencies {
  readonly database: Database;
  readonly cipher: TokenCipher;
  /** Null while protected payments are off: the job then does nothing. */
  readonly settings: AsaasSettings | null;
  readonly now?: () => Date;
}

export interface AsaasPaymentRound {
  checked: number;
  held: number;
  released: number;
  refundsRequested: number;
}

function accountLoader(database: Database) {
  const accounts = new Map<string, Promise<SupplierPaymentAccount | null>>();
  return async (supplierId: string): Promise<SupplierPaymentAccount | null> => {
    const cached = accounts.get(supplierId);
    if (cached !== undefined) {
      return cached;
    }
    const loading = findSupplierPaymentAccount(database, { supplierId, provider: "asaas" });
    accounts.set(supplierId, loading);
    return loading;
  };
}

type LoadAccount = ReturnType<typeof accountLoader>;

/** Asaas unreachable or the account's key refused: this payment waits for the next round. */
function isDeferrable(error: unknown): boolean {
  return isAsaasError(error) || error instanceof AsaasAccountUnavailableError;
}

async function reconcileOne(
  context: AsaasContext,
  input: { payment: ShipmentPayment; loadAccount: LoadAccount; now: Date },
): Promise<void> {
  // Marked first: a payment that keeps failing still gives way to the others next round.
  await markShipmentPaymentChecked(context.database, {
    paymentId: input.payment.id,
    now: input.now,
  });
  const account = await input.loadAccount(input.payment.supplierId);
  if (account?.status !== "connected") {
    return;
  }
  try {
    await reconcileAsaasParcel(context, { account, payment: input.payment });
  } catch (error) {
    if (!isDeferrable(error)) {
      throw error;
    }
    logger.warn("asaas.reconcile_deferred", { shipmentPaymentId: input.payment.id, error });
  }
}

/** The held payment as Asaas reports it now: status, guarantee and refunds read back first. */
async function freshHeld(
  context: AsaasContext,
  input: { held: HeldPayment; account: SupplierPaymentAccount },
): Promise<HeldPayment> {
  const chargeId = input.held.payment.providerPaymentId;
  if (chargeId === null) {
    return input.held;
  }
  const result = await syncAsaasCharge(context, { account: input.account, chargeId });
  return result.kind === "applied" ? { ...input.held, payment: result.payment } : input.held;
}

async function settleOne(
  context: AsaasContext,
  input: { held: HeldPayment; loadAccount: LoadAccount; now: Date },
): Promise<HeldMoneyOutcome["kind"] | null> {
  const { payment } = input.held;
  await markShipmentPaymentChecked(context.database, { paymentId: payment.id, now: input.now });
  const account = await input.loadAccount(payment.supplierId);
  if (account?.status !== "connected") {
    return null;
  }
  try {
    const held = await freshHeld(context, { held: input.held, account });
    if (held.payment.status !== "approved" && held.payment.status !== "charged_back") {
      return null;
    }
    const outcome = await settleHeldPayment(context, { account, held, now: input.now });
    return outcome.kind;
  } catch (error) {
    if (!isDeferrable(error)) {
      throw error;
    }
    logger.warn("asaas.settle_deferred", { shipmentPaymentId: payment.id, error });
    return null;
  }
}

/**
 * Every few minutes: reads back the open Asaas charges a notice may have missed, then applies the
 * release rule to the money still held: release seven days after delivery, refund when the parcel
 * was cancelled or came back, and the team warned of what no rule decides.
 */
export function createAsaasPaymentProcessor(dependencies: AsaasPaymentDependencies) {
  return async function processAsaasPayments(): Promise<AsaasPaymentRound> {
    const { settings } = dependencies;
    if (settings === null) {
      return { checked: 0, held: 0, released: 0, refundsRequested: 0 };
    }
    const context = { database: dependencies.database, cipher: dependencies.cipher, settings };
    const now = dependencies.now?.() ?? new Date();
    const loadAccount = accountLoader(dependencies.database);
    const open = await listShipmentPaymentsToReconcile(context.database, {
      provider: "asaas",
      now,
      recheckForInMs: RECHECK_UNPAID_FOR_IN_MS,
      limit: SUPPLIER_PAYMENT_BATCH,
    });
    // One at a time: each supplier account has its own limits at Asaas.
    for (const payment of open) {
      await reconcileOne(context, { payment, loadAccount, now });
    }
    const held = await listHeldPayments(context.database, { limit: SUPPLIER_PAYMENT_BATCH });
    const outcomes: (HeldMoneyOutcome["kind"] | null)[] = [];
    for (const item of held) {
      outcomes.push(await settleOne(context, { held: item, loadAccount, now }));
    }
    const round: AsaasPaymentRound = {
      checked: open.length,
      held: held.length,
      released: outcomes.filter((kind) => kind === "released").length,
      refundsRequested: outcomes.filter((kind) => kind === "refund_requested").length,
    };
    if (round.checked + round.held > 0) {
      logger.info("asaas.supplier_payments_round", { ...round });
    }
    return round;
  };
}
