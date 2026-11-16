import type { FulfillmentStatus } from "@sellbridge/shared/schemas";
import type { ShipmentTiming } from "@sellbridge/shared/shipment-delay";
import type {
  ShipmentPaymentRefundReason,
  ShipmentPaymentStatus,
} from "@sellbridge/shared/shipment-payments";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type { Database } from "../client.ts";
import {
  orderItems,
  orders,
  orderShipments,
  paymentOAuthStates,
  platformSettings,
  shipmentPaymentCheckouts,
  shipmentPayments,
  supplierPaymentAccounts,
  suppliers,
} from "../schema/index.ts";
import { supplierTimingColumns } from "./shipment-timing.ts";

type PaymentAccountRow = typeof supplierPaymentAccounts.$inferSelect;
export type PaymentProvider = PaymentAccountRow["provider"];
export type SupplierPaymentAccount = PaymentAccountRow;
export type ShipmentPayment = typeof shipmentPayments.$inferSelect;
export type ShipmentPaymentCheckout = typeof shipmentPaymentCheckouts.$inferSelect;

export interface PaymentAccountTokens {
  accessTokenEnc: string;
  refreshTokenEnc: string;
  expiresAt: Date;
}

/** A one-time state for the provider's consent page; it remembers who asked, for which supplier. */
export async function createPaymentOAuthState(
  database: Database,
  input: {
    state: string;
    supplierId: string;
    userId: string;
    provider: PaymentProvider;
    ttlMilliseconds: number;
  },
): Promise<void> {
  // Abandoned consents are never consumed: each new one clears the expired ones.
  await database.delete(paymentOAuthStates).where(lt(paymentOAuthStates.expiresAt, new Date()));
  await database.insert(paymentOAuthStates).values({
    state: input.state,
    supplierId: input.supplierId,
    userId: input.userId,
    provider: input.provider,
    expiresAt: new Date(Date.now() + input.ttlMilliseconds),
  });
}

/**
 * Deletes the state and returns its supplier, only for the same user and provider and before it
 * expires: a state is good for one callback, from the person who started it.
 */
export async function consumePaymentOAuthState(
  database: Database,
  input: { state: string; userId: string; provider: PaymentProvider },
): Promise<{ supplierId: string } | null> {
  const [row] = await database
    .delete(paymentOAuthStates)
    .where(
      and(
        eq(paymentOAuthStates.state, input.state),
        eq(paymentOAuthStates.provider, input.provider),
      ),
    )
    .returning();
  if (row === undefined) {
    return null;
  }
  if (row.userId !== input.userId) {
    return null;
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    return null;
  }
  return { supplierId: row.supplierId };
}

/** Saves the supplier's payment account as linked; linking again replaces the old tokens. */
export async function upsertSupplierPaymentAccount(
  database: Database,
  input: {
    supplierId: string;
    provider: PaymentProvider;
    userId: string | null;
    tokens: PaymentAccountTokens;
    providerAccountId: string;
  },
): Promise<SupplierPaymentAccount> {
  const values = {
    ...input.tokens,
    providerAccountId: input.providerAccountId,
    status: "connected" as const,
    lastError: null,
    connectedByUserId: input.userId,
    connectedAt: new Date(),
  };
  const [row] = await database
    .insert(supplierPaymentAccounts)
    .values({ supplierId: input.supplierId, provider: input.provider, ...values })
    .onConflictDoUpdate({
      target: [supplierPaymentAccounts.supplierId, supplierPaymentAccounts.provider],
      set: values,
    })
    .returning();
  if (row === undefined) {
    throw new Error(`Payment account not saved for supplier ${input.supplierId}`);
  }
  return row;
}

export async function findSupplierPaymentAccount(
  database: Database,
  input: { supplierId: string; provider: PaymentProvider },
): Promise<SupplierPaymentAccount | null> {
  const [row] = await database
    .select()
    .from(supplierPaymentAccounts)
    .where(
      and(
        eq(supplierPaymentAccounts.supplierId, input.supplierId),
        eq(supplierPaymentAccounts.provider, input.provider),
      ),
    );
  return row ?? null;
}

/** Unlinks the account and drops its tokens; the payments already made keep their record. */
export async function disconnectSupplierPaymentAccount(
  database: Database,
  input: { supplierId: string; provider: PaymentProvider },
): Promise<boolean> {
  const updated = await database
    .update(supplierPaymentAccounts)
    .set({
      status: "disconnected",
      accessTokenEnc: null,
      refreshTokenEnc: null,
      expiresAt: null,
      lastError: null,
    })
    .where(
      and(
        eq(supplierPaymentAccounts.supplierId, input.supplierId),
        eq(supplierPaymentAccounts.provider, input.provider),
      ),
    )
    .returning({ id: supplierPaymentAccounts.id });
  return updated.length > 0;
}

/**
 * Swaps the tokens only while the account is linked and still holds the refresh token the caller
 * used: a new link or a parallel refresh in between wins, and this one is dropped.
 */
export async function rotatePaymentAccountTokens(
  database: Database,
  input: { accountId: string; previousRefreshTokenEnc: string; tokens: PaymentAccountTokens },
): Promise<boolean> {
  const updated = await database
    .update(supplierPaymentAccounts)
    .set({ ...input.tokens, lastError: null })
    .where(
      and(
        eq(supplierPaymentAccounts.id, input.accountId),
        eq(supplierPaymentAccounts.status, "connected"),
        eq(supplierPaymentAccounts.refreshTokenEnc, input.previousRefreshTokenEnc),
      ),
    )
    .returning({ id: supplierPaymentAccounts.id });
  return updated.length > 0;
}

/**
 * Marks the account in error (the provider refused its token); the supplier links it again. Only
 * while it still holds the refused tokens: a parallel refresh or a new link in between wins.
 */
export async function markSupplierPaymentAccountError(
  database: Database,
  input: { accountId: string; lastError: string; refreshTokenEnc: string | null },
): Promise<boolean> {
  const updated = await database
    .update(supplierPaymentAccounts)
    .set({ status: "error", lastError: input.lastError })
    .where(
      and(
        eq(supplierPaymentAccounts.id, input.accountId),
        eq(supplierPaymentAccounts.status, "connected"),
        input.refreshTokenEnc === null
          ? isNull(supplierPaymentAccounts.refreshTokenEnc)
          : eq(supplierPaymentAccounts.refreshTokenEnc, input.refreshTokenEnc),
      ),
    )
    .returning({ id: supplierPaymentAccounts.id });
  return updated.length > 0;
}

/** The linked accounts behind a provider account id, as payment notices name it. */
export async function findPaymentAccountsByProviderAccount(
  database: Database,
  input: { provider: PaymentProvider; providerAccountId: string },
): Promise<SupplierPaymentAccount[]> {
  return database
    .select()
    .from(supplierPaymentAccounts)
    .where(
      and(
        eq(supplierPaymentAccounts.provider, input.provider),
        eq(supplierPaymentAccounts.providerAccountId, input.providerAccountId),
      ),
    );
}

export interface PaymentFeeSetting {
  /** Null until the admin sets it; payments then use zero. */
  basisPoints: number | null;
  updatedAt: Date | null;
  updatedByUserId: string | null;
}

export async function getPaymentFeeSetting(database: Database): Promise<PaymentFeeSetting> {
  const [row] = await database
    .select({
      basisPoints: platformSettings.paymentFeeBasisPoints,
      updatedAt: platformSettings.updatedAt,
      updatedByUserId: platformSettings.updatedByUserId,
    })
    .from(platformSettings)
    .where(eq(platformSettings.id, 1));
  if (row === undefined) {
    return { basisPoints: null, updatedAt: null, updatedByUserId: null };
  }
  return row;
}

/** Saves the fee rate; the database refuses values outside 0–3000 basis points. */
export async function setPaymentFeeSetting(
  database: Database,
  input: { basisPoints: number; userId: string },
): Promise<PaymentFeeSetting> {
  const values = {
    paymentFeeBasisPoints: input.basisPoints,
    updatedByUserId: input.userId,
    updatedAt: new Date(),
  };
  const [row] = await database
    .insert(platformSettings)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({ target: platformSettings.id, set: values })
    .returning();
  if (row === undefined) {
    throw new Error("Platform settings not saved");
  }
  return {
    basisPoints: row.paymentFeeBasisPoints,
    updatedAt: row.updatedAt,
    updatedByUserId: row.updatedByUserId,
  };
}

/** A parcel the reseller may pay its supplier for, with what is owed for it. */
export interface PayableShipment {
  shipmentId: string;
  orderId: string;
  externalOrderId: string;
  supplierId: string;
  supplierName: string;
  catalogKind: "supplier" | "seller";
  status: FulfillmentStatus;
  /** Each item's cost times its quantity, in cents. */
  amountCents: number;
  payment: ShipmentPayment | null;
}

/** The parcel as the reseller (its tenant) sees it; another tenant's parcel is null. */
export async function findPayableShipment(
  database: Database,
  input: { tenantId: string; shipmentId: string },
): Promise<PayableShipment | null> {
  const [row] = await database
    .select({
      shipment: orderShipments,
      externalOrderId: orders.externalOrderId,
      supplierName: suppliers.name,
      catalogKind: suppliers.catalogKind,
    })
    .from(orderShipments)
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
    .where(
      and(eq(orderShipments.id, input.shipmentId), eq(orderShipments.tenantId, input.tenantId)),
    );
  if (row === undefined) {
    return null;
  }
  const [amountCents, payment] = await Promise.all([
    shipmentAmountCents(database, row.shipment.orderId, row.shipment.items),
    findShipmentPayment(database, row.shipment.id),
  ]);
  return {
    shipmentId: row.shipment.id,
    orderId: row.shipment.orderId,
    externalOrderId: row.externalOrderId,
    supplierId: row.shipment.supplierId,
    supplierName: row.supplierName,
    catalogKind: row.catalogKind,
    status: row.shipment.status,
    amountCents,
    payment,
  };
}

async function shipmentAmountCents(
  database: Database,
  orderId: string,
  items: readonly { orderItemId: string; quantity: number }[],
): Promise<number> {
  if (items.length === 0) {
    return 0;
  }
  const costs = await database
    .select({ id: orderItems.id, unitCostCents: orderItems.unitCostCents })
    .from(orderItems)
    .where(
      and(
        eq(orderItems.orderId, orderId),
        inArray(
          orderItems.id,
          items.map((item) => item.orderItemId),
        ),
      ),
    );
  const costById = new Map(costs.map((cost) => [cost.id, cost.unitCostCents]));
  let total = 0;
  for (const item of items) {
    total += (costById.get(item.orderItemId) ?? 0) * item.quantity;
  }
  return total;
}

export async function findShipmentPayment(
  database: Database,
  shipmentId: string,
): Promise<ShipmentPayment | null> {
  const [row] = await database
    .select()
    .from(shipmentPayments)
    .where(eq(shipmentPayments.shipmentId, shipmentId));
  return row ?? null;
}

export async function findShipmentPaymentById(
  database: Database,
  paymentId: string,
): Promise<ShipmentPayment | null> {
  const [row] = await database
    .select()
    .from(shipmentPayments)
    .where(eq(shipmentPayments.id, paymentId));
  return row ?? null;
}

/**
 * Starts (or restarts) the parcel's payment as pending with a fresh amount and fee, holding it
 * until `reservedUntil` while the checkout is created. A paid parcel, or one whose checkout is
 * still open or being created by another request, is never touched: the result is null and no
 * second checkout is opened.
 */
export async function startShipmentPayment(
  database: Database,
  input: {
    shipmentId: string;
    supplierId: string;
    provider: PaymentProvider;
    amountCents: number;
    platformFeeCents: number;
    platformFeeBasisPoints: number;
    now: Date;
    reservedUntil: Date;
  },
): Promise<ShipmentPayment | null> {
  const values = {
    provider: input.provider,
    status: "pending" as const,
    amountCents: input.amountCents,
    platformFeeCents: input.platformFeeCents,
    platformFeeBasisPoints: input.platformFeeBasisPoints,
    preferenceId: null,
    checkoutUrl: null,
    checkoutExpiresAt: input.reservedUntil,
    providerPaymentId: null,
    paymentMethod: null,
    paidAt: null,
  };
  const restartable = and(
    notInArray(shipmentPayments.status, LOCKED_STATUSES),
    or(
      ne(shipmentPayments.status, "pending"),
      isNull(shipmentPayments.checkoutExpiresAt),
      lte(shipmentPayments.checkoutExpiresAt, input.now),
    ),
  );
  if (restartable === undefined) {
    throw new Error("The restart condition of a shipment payment came out empty");
  }
  const [row] = await database
    .insert(shipmentPayments)
    .values({ shipmentId: input.shipmentId, supplierId: input.supplierId, ...values })
    .onConflictDoUpdate({
      target: shipmentPayments.shipmentId,
      set: values,
      setWhere: restartable,
    })
    .returning();
  return row ?? null;
}

/**
 * Statuses a new checkout may not overwrite: the money moved (or came back) already, or a
 * payment is under review and a second one would charge the reseller twice.
 */
const LOCKED_STATUSES: ShipmentPaymentStatus[] = [
  "in_process",
  "approved",
  "refunded",
  "charged_back",
];

/**
 * Saves the checkout just created as the parcel's open one, and keeps it in the parcel's
 * checkout history with what it charges, so a late payment through it is still recognized.
 */
export async function savePaymentPreference(
  database: Database,
  input: {
    paymentId: string;
    preferenceId: string;
    checkoutUrl: string;
    checkoutExpiresAt: Date;
    amountCents: number;
    platformFeeCents: number;
  },
): Promise<void> {
  await database.transaction(async (transaction) => {
    await transaction
      .update(shipmentPayments)
      .set({
        preferenceId: input.preferenceId,
        checkoutUrl: input.checkoutUrl,
        checkoutExpiresAt: input.checkoutExpiresAt,
      })
      .where(eq(shipmentPayments.id, input.paymentId));
    await transaction
      .insert(shipmentPaymentCheckouts)
      .values({
        shipmentPaymentId: input.paymentId,
        preferenceId: input.preferenceId,
        amountCents: input.amountCents,
        platformFeeCents: input.platformFeeCents,
      })
      .onConflictDoNothing({ target: shipmentPaymentCheckouts.preferenceId });
  });
}

/** Every checkout opened for the parcel payment, the newest first. */
export async function listShipmentPaymentCheckouts(
  database: Database,
  paymentId: string,
): Promise<ShipmentPaymentCheckout[]> {
  return database
    .select()
    .from(shipmentPaymentCheckouts)
    .where(eq(shipmentPaymentCheckouts.shipmentPaymentId, paymentId))
    .orderBy(desc(shipmentPaymentCheckouts.createdAt), desc(shipmentPaymentCheckouts.id));
}

/** Frees a parcel whose checkout could not be created, so the reseller can try again at once. */
export async function releaseShipmentPaymentReservation(
  database: Database,
  paymentId: string,
): Promise<void> {
  await database
    .update(shipmentPayments)
    .set({ checkoutExpiresAt: null })
    .where(
      and(
        eq(shipmentPayments.id, paymentId),
        eq(shipmentPayments.status, "pending"),
        isNull(shipmentPayments.checkoutUrl),
      ),
    );
}

/** The parcel's checkout still taking payments, to send a second click to the same one. */
export function openCheckoutUrl(payment: ShipmentPayment | null, now: Date): string | null {
  if (payment?.status !== "pending" || payment.checkoutUrl === null) {
    return null;
  }
  if (payment.checkoutExpiresAt === null || payment.checkoutExpiresAt <= now) {
    return null;
  }
  return payment.checkoutUrl;
}

/** What a provider notice did to the parcel's payment. */
export type ProviderPaymentOutcome =
  | { kind: "applied"; payment: ShipmentPayment }
  | { kind: "unchanged"; payment: ShipmentPayment }
  | { kind: "duplicate"; payment: ShipmentPayment };

/**
 * Records what the provider says about the payment. Repeated or late notices are harmless: the
 * row changes only when the status does, a paid parcel never goes back to pending or rejected,
 * and the first approval's date is kept. Once a payment is attached, another payment takes its
 * place by being approved, or by still being open or under review after a failed attempt; a second
 * approval of a paid parcel is a duplicate charge, reported and never recorded over the first.
 */
export async function applyProviderPayment(
  database: Database,
  input: {
    paymentId: string;
    providerPaymentId: string;
    status: ShipmentPaymentStatus;
    paymentMethod: string | null;
    approvedAt: Date | null;
    /**
     * What the checkout the payment came through charged, when it is not the parcel's latest:
     * the parcel then records that amount and fee, which is what the reseller paid.
     */
    charged?: { amountCents: number; platformFeeCents: number };
  },
): Promise<ProviderPaymentOutcome | null> {
  const current = await findShipmentPaymentById(database, input.paymentId);
  if (current === null) {
    return null;
  }
  const attached = current.providerPaymentId;
  if (attached !== null && attached !== input.providerPaymentId) {
    if (input.status === "approved" && current.status === "approved") {
      return { kind: "duplicate", payment: current };
    }
    if (input.status !== "approved" && !replacesUnpaidAttempt(current.status, input.status)) {
      return { kind: "unchanged", payment: current };
    }
  }
  if (!isAllowedTransition(current.status, input.status)) {
    return { kind: "unchanged", payment: current };
  }
  const paidAt =
    input.status === "approved" ? (current.paidAt ?? input.approvedAt) : current.paidAt;
  const [row] = await database
    .update(shipmentPayments)
    .set({
      status: input.status,
      providerPaymentId: input.providerPaymentId,
      paymentMethod: input.paymentMethod ?? current.paymentMethod,
      paidAt,
      ...input.charged,
    })
    .where(
      and(eq(shipmentPayments.id, input.paymentId), eq(shipmentPayments.status, current.status)),
    )
    .returning();
  if (row === undefined) {
    // A parallel notice changed the row first: judge this one again against what it holds now,
    // so a second approval is still reported as a duplicate.
    return applyProviderPayment(database, input);
  }
  return { kind: "applied", payment: row };
}

const FAILED_ATTEMPT_STATUSES: readonly ShipmentPaymentStatus[] = ["rejected", "cancelled"];

/**
 * A buyer may retry on the same checkout after a failed attempt: that newer attempt, while still
 * open or under review, must take the parcel's place so the lock against a second checkout holds.
 */
function replacesUnpaidAttempt(
  current: ShipmentPaymentStatus,
  incoming: ShipmentPaymentStatus,
): boolean {
  if (incoming === "in_process") {
    return current === "pending" || FAILED_ATTEMPT_STATUSES.includes(current);
  }
  if (incoming === "pending") {
    return FAILED_ATTEMPT_STATUSES.includes(current);
  }
  return false;
}

function isAllowedTransition(from: ShipmentPaymentStatus, to: ShipmentPaymentStatus): boolean {
  if (from === to) {
    return false;
  }
  if (from === "approved") {
    return to === "refunded" || to === "charged_back";
  }
  if (from === "refunded" || from === "charged_back") {
    return false;
  }
  return true;
}

/** What each parcel shows about paying its supplier, read for a list of parcels at once. */
export interface ShipmentPaymentSummary {
  status: ShipmentPaymentStatus;
  paidAt: Date | null;
  paymentMethod: string | null;
}

export async function listShipmentPaymentSummaries(
  database: Database,
  shipmentIds: readonly string[],
): Promise<Map<string, ShipmentPaymentSummary>> {
  if (shipmentIds.length === 0) {
    return new Map();
  }
  const rows = await database
    .select({
      shipmentId: shipmentPayments.shipmentId,
      status: shipmentPayments.status,
      paidAt: shipmentPayments.paidAt,
      paymentMethod: shipmentPayments.paymentMethod,
    })
    .from(shipmentPayments)
    .where(inArray(shipmentPayments.shipmentId, [...shipmentIds]));
  return new Map(
    rows.map((row) => [
      row.shipmentId,
      { status: row.status, paidAt: row.paidAt, paymentMethod: row.paymentMethod },
    ]),
  );
}

/** The suppliers among these that can receive here now (a linked account). */
export async function listSuppliersReceivingPayments(
  database: Database,
  input: { supplierIds: readonly string[]; provider: PaymentProvider },
): Promise<Set<string>> {
  if (input.supplierIds.length === 0) {
    return new Set();
  }
  const rows = await database
    .select({ supplierId: supplierPaymentAccounts.supplierId })
    .from(supplierPaymentAccounts)
    .where(
      and(
        inArray(supplierPaymentAccounts.supplierId, [...input.supplierIds]),
        eq(supplierPaymentAccounts.provider, input.provider),
        eq(supplierPaymentAccounts.status, "connected"),
      ),
    );
  return new Set(rows.map((row) => row.supplierId));
}

/** Unpaid statuses whose checkout may still bring a payment the notices missed. */
const RECHECKED_UNPAID_STATUSES: ShipmentPaymentStatus[] = ["pending", "rejected", "cancelled"];

/**
 * Parcel payments whose provider status may have moved without a notice reaching SellBridge:
 * every payment under review, and the unpaid ones whose latest checkout closed less than
 * `recheckForInMs` ago. The least recently checked come first.
 */
export async function listShipmentPaymentsToReconcile(
  database: Database,
  input: { now: Date; recheckForInMs: number; limit: number },
): Promise<ShipmentPayment[]> {
  const windowStart = new Date(input.now.getTime() - input.recheckForInMs);
  return database
    .select()
    .from(shipmentPayments)
    .where(
      or(
        eq(shipmentPayments.status, "in_process"),
        and(
          inArray(shipmentPayments.status, RECHECKED_UNPAID_STATUSES),
          isNotNull(shipmentPayments.preferenceId),
          gt(shipmentPayments.checkoutExpiresAt, windowStart),
        ),
      ),
    )
    .orderBy(sql`${shipmentPayments.checkedAt} asc nulls first`, asc(shipmentPayments.id))
    .limit(input.limit);
}

export async function markShipmentPaymentChecked(
  database: Database,
  input: { paymentId: string; now: Date },
): Promise<void> {
  await database
    .update(shipmentPayments)
    .set({ checkedAt: input.now })
    .where(eq(shipmentPayments.id, input.paymentId));
}

/** A paid parcel that may be owed back to the reseller, with what decides it. */
export interface RefundCandidate {
  payment: ShipmentPayment;
  tenantId: string;
  orderId: string;
  /** The parcel's timing, as `supplierPaymentRefundReason` reads it. */
  timing: ShipmentTiming;
}

/** Parcels still with the supplier, or cancelled or back with it: a refund may be due for these. */
const REFUNDABLE_SHIPMENT_STATUSES: FulfillmentStatus[] = [
  "forwarded",
  "accepted",
  "picking",
  "ready",
  "cancelled",
  "returned",
];

/**
 * Paid parcels the supplier has not shipped, or that were cancelled or came back, whose refund
 * has not failed for good. Cancelled and returned ones come first, then the oldest payments.
 */
export async function listShipmentPaymentRefundCandidates(
  database: Database,
  input: { limit: number },
): Promise<RefundCandidate[]> {
  const rows = await database
    .select({
      payment: shipmentPayments,
      tenantId: orderShipments.tenantId,
      orderId: orderShipments.orderId,
      status: orderShipments.status,
      dispatchDeadlineAt: orderShipments.dispatchDeadlineAt,
      estimatedDeliveryAt: orderShipments.estimatedDeliveryAt,
      ...supplierTimingColumns,
    })
    .from(shipmentPayments)
    .innerJoin(orderShipments, eq(orderShipments.id, shipmentPayments.shipmentId))
    .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
    .where(
      and(
        eq(shipmentPayments.status, "approved"),
        isNull(shipmentPayments.refundFailedAt),
        inArray(orderShipments.status, REFUNDABLE_SHIPMENT_STATUSES),
      ),
    )
    .orderBy(
      sql`${orderShipments.status} in ('cancelled','returned') desc`,
      sql`${shipmentPayments.paidAt} asc nulls first`,
      asc(shipmentPayments.id),
    )
    .limit(input.limit);
  return rows.map((row) => ({
    payment: row.payment,
    tenantId: row.tenantId,
    orderId: row.orderId,
    timing: {
      status: row.status,
      dispatchDeadlineAt: row.dispatchDeadlineAt,
      estimatedDeliveryAt: row.estimatedDeliveryAt,
      shippedAt: null,
      forwardedAt: row.forwardedAt,
      acceptWithinHours: row.acceptWithinHours,
      dispatchWithinHours: row.dispatchWithinHours,
    },
  }));
}

/**
 * Records that SellBridge gives the parcel's money back, keeping the first reason and date when
 * asked again (a retry after the provider was unreachable). Null when the parcel is no longer
 * paid, or its refund already failed for good.
 */
export async function requestShipmentPaymentRefund(
  database: Database,
  input: { paymentId: string; reason: ShipmentPaymentRefundReason; now: Date },
): Promise<ShipmentPayment | null> {
  const [row] = await database
    .update(shipmentPayments)
    .set({
      refundReason: sql`coalesce(${shipmentPayments.refundReason}, ${input.reason})`,
      refundRequestedAt: sql`coalesce(${shipmentPayments.refundRequestedAt}, ${input.now.toISOString()}::timestamptz)`,
    })
    .where(
      and(
        eq(shipmentPayments.id, input.paymentId),
        eq(shipmentPayments.status, "approved"),
        isNull(shipmentPayments.refundFailedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Records that the provider refused the refund for good. True only the first time, so the
 * supplier is blocked and the team alerted once.
 */
export async function markShipmentPaymentRefundFailed(
  database: Database,
  input: { paymentId: string; error: string; now: Date },
): Promise<boolean> {
  const updated = await database
    .update(shipmentPayments)
    .set({ refundFailedAt: input.now, refundError: input.error })
    .where(and(eq(shipmentPayments.id, input.paymentId), isNull(shipmentPayments.refundFailedAt)))
    .returning({ id: shipmentPayments.id });
  return updated.length > 0;
}
