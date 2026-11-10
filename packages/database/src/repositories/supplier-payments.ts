import type { FulfillmentStatus } from "@sellbridge/shared/schemas";
import type { ShipmentPaymentStatus } from "@sellbridge/shared/shipment-payments";
import { and, eq, inArray, lt, notInArray } from "drizzle-orm";
import type { Database } from "../client.ts";
import {
  orderItems,
  orders,
  orderShipments,
  paymentOAuthStates,
  platformSettings,
  shipmentPayments,
  supplierPaymentAccounts,
  suppliers,
} from "../schema/index.ts";

type PaymentAccountRow = typeof supplierPaymentAccounts.$inferSelect;
export type PaymentProvider = PaymentAccountRow["provider"];
export type SupplierPaymentAccount = PaymentAccountRow;
export type ShipmentPayment = typeof shipmentPayments.$inferSelect;

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

/** Marks the account in error (the provider refused its token); the supplier links it again. */
export async function markSupplierPaymentAccountError(
  database: Database,
  input: { accountId: string; lastError: string },
): Promise<void> {
  await database
    .update(supplierPaymentAccounts)
    .set({ status: "error", lastError: input.lastError })
    .where(eq(supplierPaymentAccounts.id, input.accountId));
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
 * Starts (or restarts) the parcel's payment as pending with a fresh amount and fee. A paid
 * parcel is never touched: the result is null and nothing is charged again.
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
    checkoutExpiresAt: null,
    providerPaymentId: null,
    paymentMethod: null,
    paidAt: null,
  };
  const [row] = await database
    .insert(shipmentPayments)
    .values({ shipmentId: input.shipmentId, supplierId: input.supplierId, ...values })
    .onConflictDoUpdate({
      target: shipmentPayments.shipmentId,
      set: values,
      setWhere: notInArray(shipmentPayments.status, LOCKED_STATUSES),
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

export async function savePaymentPreference(
  database: Database,
  input: { paymentId: string; preferenceId: string; checkoutUrl: string; checkoutExpiresAt: Date },
): Promise<void> {
  await database
    .update(shipmentPayments)
    .set({
      preferenceId: input.preferenceId,
      checkoutUrl: input.checkoutUrl,
      checkoutExpiresAt: input.checkoutExpiresAt,
    })
    .where(eq(shipmentPayments.id, input.paymentId));
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
 * and the first approval's date is kept. Once a payment is attached, another payment only takes
 * its place by being approved; a second approval of a paid parcel is a duplicate charge, reported
 * and never recorded over the first.
 */
export async function applyProviderPayment(
  database: Database,
  input: {
    paymentId: string;
    providerPaymentId: string;
    status: ShipmentPaymentStatus;
    paymentMethod: string | null;
    approvedAt: Date | null;
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
    if (input.status !== "approved") {
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
    })
    .where(
      and(eq(shipmentPayments.id, input.paymentId), eq(shipmentPayments.status, current.status)),
    )
    .returning();
  if (row === undefined) {
    // A parallel notice changed the row first: report what it holds now.
    const latest = await findShipmentPaymentById(database, input.paymentId);
    return latest === null ? null : { kind: "unchanged", payment: latest };
  }
  return { kind: "applied", payment: row };
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
