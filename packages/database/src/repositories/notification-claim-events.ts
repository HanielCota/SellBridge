import { and, desc, eq, or } from "drizzle-orm";
import type { Database } from "../client.ts";
import { marketplaceClaims, orders, orderShipments, suppliers } from "../schema/index.ts";
import { supplierTabFor } from "./marketplace-claims.ts";

/**
 * A buyer's claim still open on the marketplace. The reseller answers it; the supplier of the
 * order only follows it, and its bell links to its own orders.
 */
export interface MarketplaceClaimEvent {
  kind: "marketplace_claim";
  /** The order the claim is about. */
  entityId: string;
  at: Date;
  externalOrderId: string;
  claimId: string;
  stage: string;
  actionResponsible: "seller" | "buyer" | "mediator" | null;
  actionDueAt: Date | null;
  reader: "reseller" | "supplier";
  /** The supplier's orders tab holding the parcel, for the supplier's link. */
  supplierTab: string;
}

/**
 * Bell entries for open claims: the reseller's own orders, and the orders a supplier profile
 * ships. They stay until the claim closes.
 */
export async function marketplaceClaimEvents(
  database: Database,
  tenantId: string,
  limit: number,
): Promise<MarketplaceClaimEvent[]> {
  const rows = await database
    .selectDistinctOn([marketplaceClaims.marketplaceUpdatedAt, marketplaceClaims.id], {
      entityId: marketplaceClaims.orderId,
      at: marketplaceClaims.marketplaceUpdatedAt,
      externalOrderId: orders.externalOrderId,
      claimId: marketplaceClaims.id,
      stage: marketplaceClaims.stage,
      actionResponsible: marketplaceClaims.actionResponsible,
      actionDueAt: marketplaceClaims.actionDueAt,
      resellerTenantId: marketplaceClaims.tenantId,
      parcelStatus: orderShipments.status,
    })
    .from(marketplaceClaims)
    .innerJoin(orders, eq(orders.id, marketplaceClaims.orderId))
    .leftJoin(
      orderShipments,
      and(
        eq(orderShipments.orderId, marketplaceClaims.orderId),
        eq(orderShipments.tenantId, marketplaceClaims.tenantId),
      ),
    )
    .leftJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
    .where(
      and(
        eq(marketplaceClaims.status, "opened"),
        or(eq(marketplaceClaims.tenantId, tenantId), eq(suppliers.organizationId, tenantId)),
      ),
    )
    .orderBy(desc(marketplaceClaims.marketplaceUpdatedAt), desc(marketplaceClaims.id))
    .limit(limit);
  return rows.map(({ resellerTenantId, parcelStatus, ...row }) => ({
    kind: "marketplace_claim" as const,
    ...row,
    reader: resellerTenantId === tenantId ? ("reseller" as const) : ("supplier" as const),
    supplierTab: parcelStatus === null ? "todo" : supplierTabFor(parcelStatus),
  }));
}
