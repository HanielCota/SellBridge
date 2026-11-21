import type { FulfillmentStatus } from "@sellbridge/shared/schemas";
import { and, asc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import {
  orderShipments,
  orders,
  organization,
  returnClaims,
  shipmentEvents,
  shipmentPayments,
  suppliers,
} from "../schema/index.ts";
import { cancelledByResellerAfterAccept, type ShipmentPayment } from "./supplier-payments.ts";

/**
 * A paid parcel whose money sits in the supplier's protected Asaas account, with what decides
 * whether it is released, refunded or kept.
 */
export interface HeldPayment {
  payment: ShipmentPayment;
  tenantId: string;
  orderId: string;
  shipmentStatus: FulfillmentStatus;
  /** The first time the parcel was marked delivered; only the marketplace or the reseller can. */
  deliveredAt: Date | null;
  hasOpenReturnClaim: boolean;
  /** The reseller cancelled it after the supplier accepted: the supplier may have posted it. */
  cancelledByResellerAfterAccept: boolean;
}

const firstDeliveredAt = sql<Date | null>`(
  select min(${shipmentEvents.createdAt}) from ${shipmentEvents}
  where ${shipmentEvents.shipmentId} = ${orderShipments.id} and ${shipmentEvents.status} = 'delivered'
)`.mapWith((value: string | null) => (value === null ? null : new Date(value)));

const openReturnClaim = sql<boolean>`exists (
  select 1 from ${returnClaims}
  where ${returnClaims.shipmentId} = ${orderShipments.id} and ${returnClaims.status} = 'in_review'
)`.mapWith(Boolean);

/**
 * Asaas payments taken and not yet released, refunded or given up on: the escrow job reads each
 * back from Asaas and decides. The least recently checked come first.
 */
export async function listHeldPayments(
  database: Database,
  input: { limit: number },
): Promise<HeldPayment[]> {
  const rows = await database
    .select({
      payment: shipmentPayments,
      tenantId: orderShipments.tenantId,
      orderId: orderShipments.orderId,
      shipmentStatus: orderShipments.status,
      deliveredAt: firstDeliveredAt,
      hasOpenReturnClaim: openReturnClaim,
      cancelledByResellerAfterAccept: cancelledByResellerAfterAccept(),
    })
    .from(shipmentPayments)
    .innerJoin(orderShipments, eq(orderShipments.id, shipmentPayments.shipmentId))
    .where(
      and(
        eq(shipmentPayments.provider, "asaas"),
        inArray(shipmentPayments.status, ["approved", "charged_back"]),
        isNull(shipmentPayments.releasedAt),
        isNull(shipmentPayments.refundFailedAt),
        or(isNull(shipmentPayments.escrowStatus), eq(shipmentPayments.escrowStatus, "active")),
      ),
    )
    .orderBy(sql`${shipmentPayments.checkedAt} asc nulls first`, asc(shipmentPayments.id))
    .limit(input.limit);
  return rows;
}

/**
 * Claims the release of a parcel's held money, so it is asked of Asaas once. A claim older than
 * `retryAfterInMs` whose guarantee is still active never reached Asaas and may be claimed again.
 * False when the money is already being released or refunded.
 */
export async function claimEscrowRelease(
  database: Database,
  input: { paymentId: string; now: Date; retryAfterInMs: number },
): Promise<boolean> {
  const staleBefore = new Date(input.now.getTime() - input.retryAfterInMs);
  const claimed = await database
    .update(shipmentPayments)
    .set({ releaseRequestedAt: input.now })
    .where(
      and(
        eq(shipmentPayments.id, input.paymentId),
        eq(shipmentPayments.status, "approved"),
        eq(shipmentPayments.escrowStatus, "active"),
        isNull(shipmentPayments.releasedAt),
        isNull(shipmentPayments.refundRequestedAt),
        or(
          isNull(shipmentPayments.releaseRequestedAt),
          lt(shipmentPayments.releaseRequestedAt, staleBefore),
        ),
      ),
    )
    .returning({ id: shipmentPayments.id });
  return claimed.length > 0;
}

/** Asaas confirmed the guarantee ended with the money going to the supplier. */
export async function markEscrowReleased(
  database: Database,
  input: { paymentId: string; now: Date },
): Promise<void> {
  await database
    .update(shipmentPayments)
    .set({ releasedAt: input.now, escrowStatus: "done" })
    .where(and(eq(shipmentPayments.id, input.paymentId), isNull(shipmentPayments.releasedAt)));
}

/**
 * Records the team's choice for a held payment no rule decides. Only once, and only while the
 * money is still held: false when it was already released, refunded or decided.
 */
export async function recordTeamDecision(
  database: Database,
  input: { paymentId: string; decision: "release" | "refund"; userId: string; now: Date },
): Promise<boolean> {
  const decided = await database
    .update(shipmentPayments)
    .set({
      teamDecision: input.decision,
      teamDecisionAt: input.now,
      teamDecisionByUserId: input.userId,
    })
    .where(
      and(
        eq(shipmentPayments.id, input.paymentId),
        eq(shipmentPayments.provider, "asaas"),
        eq(shipmentPayments.status, "approved"),
        isNull(shipmentPayments.teamDecision),
        isNull(shipmentPayments.releasedAt),
        isNull(shipmentPayments.refundRequestedAt),
        isNotNull(shipmentPayments.paidAt),
      ),
    )
    .returning({ id: shipmentPayments.id });
  return decided.length > 0;
}

/** A payment the team gives back by hand, with who is on each side of it. */
export interface ManualRefundCase {
  payment: ShipmentPayment;
  tenantId: string;
  orderId: string;
  orderNumber: string;
  resellerName: string;
  supplierName: string;
}

/** What the team needs to give one payment back by hand, or null when it does not exist. */
export async function findManualRefundCase(
  database: Database,
  paymentId: string,
): Promise<ManualRefundCase | null> {
  const [row] = await database
    .select({
      payment: shipmentPayments,
      tenantId: orderShipments.tenantId,
      orderId: orderShipments.orderId,
      orderNumber: orders.externalOrderId,
      resellerName: organization.name,
      supplierName: suppliers.name,
    })
    .from(shipmentPayments)
    .innerJoin(orderShipments, eq(orderShipments.id, shipmentPayments.shipmentId))
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .innerJoin(organization, eq(organization.id, orderShipments.tenantId))
    .innerJoin(suppliers, eq(suppliers.id, shipmentPayments.supplierId))
    .where(eq(shipmentPayments.id, paymentId));
  return row ?? null;
}
