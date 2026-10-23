import { notFoundError } from "@sellbridge/shared/errors";
import {
  assertClaimUndecided,
  assertCreditWithinCost,
  type ReturnClaimDecision,
  type ReturnClaimStatus,
} from "@sellbridge/shared/return-claims";
import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../client.ts";
import {
  orderShipments,
  orders,
  organization,
  returnClaims,
  suppliers,
  user,
} from "../schema/index.ts";

export { openReturnClaims, type ReturnedOrder } from "./return-claims-open.ts";

/**
 * A claim as its ticket shows it. Nothing here identifies the reseller beyond the order number:
 * the supplier reads the same view (`sellerName` is for the team only and is dropped for it).
 */
export interface ReturnClaimView {
  id: string;
  status: ReturnClaimStatus;
  supplierCostCents: number;
  creditedCents: number | null;
  refusalReason: string | null;
  decidedAt: Date | null;
  decidedByName: string | null;
  createdAt: Date;
  externalOrderId: string;
  supplierName: string;
  sellerName: string;
  items: { title: string; sku: string; quantity: number }[];
}

/** The claim a ticket was opened for, or null for every other ticket. */
export async function findReturnClaimByTicket(
  database: Database,
  ticketId: string,
): Promise<ReturnClaimView | null> {
  const [row] = await database
    .select({
      id: returnClaims.id,
      status: returnClaims.status,
      supplierCostCents: returnClaims.supplierCostCents,
      creditedCents: returnClaims.creditedCents,
      refusalReason: returnClaims.refusalReason,
      decidedAt: returnClaims.decidedAt,
      decidedByName: user.name,
      createdAt: returnClaims.createdAt,
      externalOrderId: orders.externalOrderId,
      supplierName: suppliers.name,
      sellerName: organization.name,
      items: orderShipments.items,
    })
    .from(returnClaims)
    .innerJoin(orders, eq(orders.id, returnClaims.orderId))
    .innerJoin(orderShipments, eq(orderShipments.id, returnClaims.shipmentId))
    .innerJoin(suppliers, eq(suppliers.id, returnClaims.supplierId))
    .innerJoin(organization, eq(organization.id, returnClaims.sellerTenantId))
    .leftJoin(user, eq(user.id, returnClaims.decidedById))
    .where(eq(returnClaims.ticketId, ticketId))
    .limit(1);
  if (row === undefined) {
    return null;
  }
  return {
    ...row,
    items: row.items.map((item) => ({
      title: item.title,
      sku: item.sku,
      quantity: item.quantity,
    })),
  };
}

/** Where the supplier credit of a returned order stands, as the reseller reads it. */
export interface SupplierCredit {
  orderId: string;
  status: ReturnClaimStatus;
  creditedCents: number | null;
  refusalReason: string | null;
}

/** The reseller's claims for these orders; an order with no claim is simply absent. */
export async function listSupplierCredits(
  database: Database,
  tenantId: string,
  orderIds: readonly string[],
): Promise<SupplierCredit[]> {
  if (orderIds.length === 0) {
    return [];
  }
  return database
    .select({
      orderId: returnClaims.orderId,
      status: returnClaims.status,
      creditedCents: returnClaims.creditedCents,
      refusalReason: returnClaims.refusalReason,
    })
    .from(returnClaims)
    .where(
      and(eq(returnClaims.sellerTenantId, tenantId), inArray(returnClaims.orderId, [...orderIds])),
    )
    .orderBy(returnClaims.createdAt);
}

function decisionColumns(decision: ReturnClaimDecision, supplierCostCents: number) {
  if (decision.decision === "credit") {
    return {
      status: "credited" as const,
      creditedCents: assertCreditWithinCost(decision.amountCents, supplierCostCents),
      refusalReason: null,
    };
  }
  return { status: "refused" as const, creditedCents: null, refusalReason: decision.reason };
}

/**
 * The team's decision: credit the reseller up to the supplier cost, or not, with a reason.
 * The row is locked so two people deciding at once cannot both write. The credit is a recorded
 * balance only: moving the money (Stripe, payouts) is not part of the product yet.
 */
export async function decideReturnClaim(
  database: Database,
  input: { decision: ReturnClaimDecision; actorId: string; now?: Date },
): Promise<{ ticketId: string | null; status: ReturnClaimStatus }> {
  const now = input.now ?? new Date();
  return database.transaction(async (transaction) => {
    const [claim] = await transaction
      .select({
        id: returnClaims.id,
        status: returnClaims.status,
        supplierCostCents: returnClaims.supplierCostCents,
        ticketId: returnClaims.ticketId,
      })
      .from(returnClaims)
      .where(eq(returnClaims.id, input.decision.claimId))
      .limit(1)
      .for("update");
    if (claim === undefined) {
      throw notFoundError("Devolução não encontrada");
    }
    assertClaimUndecided(claim.status);
    const columns = decisionColumns(input.decision, claim.supplierCostCents);
    await transaction
      .update(returnClaims)
      .set({ ...columns, decidedById: input.actorId, decidedAt: now })
      .where(eq(returnClaims.id, claim.id));
    return { ticketId: claim.ticketId, status: columns.status };
  });
}
