import { claimNoticeContent, type ClaimNoticeMoment } from "@sellbridge/shared/notification-events";
import type { FulfillmentStatus, Marketplace } from "@sellbridge/shared/schemas";
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, or } from "drizzle-orm";
import type { Database, Transaction } from "../client.ts";
import {
  marketplaceClaims,
  orders,
  orderShipments,
  storeConnections,
  suppliers,
} from "../schema/index.ts";
import { notifyWorkspace } from "./notification-producers.ts";

/** A claim as the marketplace reports it now (`MarketplaceClaim` without what names the order). */
export interface ClaimReading {
  externalClaimId: string;
  status: "opened" | "closed";
  type: string;
  stage: string;
  reasonId: string | null;
  openedAt: Date;
  marketplaceUpdatedAt: Date;
  resolutionReason: string | null;
  closedAt: Date | null;
  problem: string | null;
  actionResponsible: "seller" | "buyer" | "mediator" | null;
  actionDueAt: Date | null;
  return: {
    status: string;
    moneyStatus: "retained" | "refunded" | "available" | null;
    trackingCode: string | null;
    destination: "seller" | "marketplace" | null;
  } | null;
}

export interface ClaimStore {
  id: string;
  tenantId: string;
  marketplace: Marketplace;
}

export interface ClaimOrder {
  orderId: string;
  externalOrderId: string;
}

export type ClaimSaveResult =
  | { readonly saved: "created" | "updated"; readonly moment: ClaimNoticeMoment | null }
  | { readonly saved: "stale" };

/** Most order ids one claim may name: a cart holds a handful, never hundreds. */
const MAX_CLAIM_ORDER_IDS = 50;

/**
 * The store's orders named by marketplace ids: an order id, or a cart (`marketplacePackId`) id,
 * the first order first. Orders of other stores are never matched.
 */
export async function findStoreOrdersForClaim(
  database: Database,
  input: { storeConnectionId: string; externalIds: readonly string[] },
): Promise<ClaimOrder[]> {
  const externalIds = input.externalIds.slice(0, MAX_CLAIM_ORDER_IDS);
  if (externalIds.length === 0) {
    return [];
  }
  return database
    .select({ orderId: orders.id, externalOrderId: orders.externalOrderId })
    .from(orders)
    .where(
      and(
        eq(orders.storeConnectionId, input.storeConnectionId),
        or(
          inArray(orders.externalOrderId, externalIds),
          inArray(orders.marketplacePackId, externalIds),
        ),
      ),
    )
    .orderBy(asc(orders.externalOrderId));
}

function noticeMoment(
  previous: { status: string; stage: string } | undefined,
  claim: ClaimReading,
): ClaimNoticeMoment | null {
  if (previous === undefined) {
    // A claim first seen already closed (an old one, read by the daily search) is history.
    return claim.status === "opened" ? "opened" : null;
  }
  if (previous.status === "opened" && claim.status === "closed") {
    return "closed";
  }
  if (claim.status === "opened" && previous.stage !== "dispute" && claim.stage === "dispute") {
    return "mediation";
  }
  return null;
}

function claimValues(claim: ClaimReading) {
  return {
    status: claim.status,
    type: claim.type,
    stage: claim.stage,
    reasonId: claim.reasonId,
    problem: claim.problem,
    actionResponsible: claim.actionResponsible,
    actionDueAt: claim.actionDueAt,
    resolutionReason: claim.resolutionReason,
    closedAt: claim.closedAt,
    returnStatus: claim.return?.status ?? null,
    returnTrackingCode: claim.return?.trackingCode ?? null,
    returnDestination: claim.return?.destination ?? null,
    moneyStatus: claim.return?.moneyStatus ?? null,
    openedAt: claim.openedAt,
    marketplaceUpdatedAt: claim.marketplaceUpdatedAt,
    updatedAt: new Date(),
  };
}

/** The supplier's orders tab that holds a parcel in this status. */
export function supplierTabFor(status: FulfillmentStatus): string {
  if (status === "shipped") {
    return "shipped";
  }
  if (["delivered", "returned", "not_delivered", "cancelled"].includes(status)) {
    return "closed";
  }
  return "todo";
}

/** The reseller answers the buyer; the order's supplier (if any) follows. Keyed by claim and moment. */
async function queueClaimNotices(
  transaction: Transaction,
  input: {
    tenantId: string;
    order: ClaimOrder;
    externalClaimId: string;
    moment: ClaimNoticeMoment;
  },
): Promise<void> {
  const dedupeKey = `claim:${input.externalClaimId}:${input.moment}`;
  const notice = {
    orderId: input.order.orderId,
    externalOrderId: input.order.externalOrderId,
    moment: input.moment,
  };
  await notifyWorkspace(transaction, {
    tenantId: input.tenantId,
    event: "marketplace_claim",
    dedupeKey,
    content: claimNoticeContent({ ...notice, recipient: "reseller" }),
  });
  const parcels = await transaction
    .select({
      organizationId: suppliers.organizationId,
      catalogKind: suppliers.catalogKind,
      status: orderShipments.status,
    })
    .from(orderShipments)
    .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
    .where(
      and(
        eq(orderShipments.orderId, input.order.orderId),
        eq(orderShipments.tenantId, input.tenantId),
      ),
    );
  for (const parcel of parcels) {
    // The reseller's own stock has no supplier to tell.
    if (parcel.organizationId === null || parcel.catalogKind !== "supplier") {
      continue;
    }
    await notifyWorkspace(transaction, {
      tenantId: parcel.organizationId,
      event: "marketplace_claim",
      dedupeKey,
      content: claimNoticeContent({
        ...notice,
        recipient: "supplier",
        supplierTab: supplierTabFor(parcel.status),
      }),
    });
  }
}

/**
 * Stores the claim as last read. A reading older than the stored one (two jobs racing, a late
 * retry) changes nothing. Opening, mediation and closing queue notices for both sides, once.
 */
export async function saveMarketplaceClaim(
  database: Database,
  input: { store: ClaimStore; order: ClaimOrder; claim: ClaimReading },
): Promise<ClaimSaveResult> {
  const { store, order, claim } = input;
  return database.transaction(async (transaction) => {
    const [previous] = await transaction
      .select({
        id: marketplaceClaims.id,
        status: marketplaceClaims.status,
        stage: marketplaceClaims.stage,
        marketplaceUpdatedAt: marketplaceClaims.marketplaceUpdatedAt,
      })
      .from(marketplaceClaims)
      .where(
        and(
          eq(marketplaceClaims.marketplace, store.marketplace),
          eq(marketplaceClaims.externalClaimId, claim.externalClaimId),
        ),
      )
      .for("update");
    if (previous !== undefined && previous.marketplaceUpdatedAt > claim.marketplaceUpdatedAt) {
      return { saved: "stale" };
    }
    const moment = noticeMoment(previous, claim);
    if (previous === undefined) {
      await transaction
        .insert(marketplaceClaims)
        .values({
          tenantId: store.tenantId,
          orderId: order.orderId,
          storeConnectionId: store.id,
          marketplace: store.marketplace,
          externalClaimId: claim.externalClaimId,
          ...claimValues(claim),
        })
        // A concurrent first reading already stored it; the dedupe key keeps one notice.
        .onConflictDoNothing();
    }
    if (previous !== undefined) {
      await transaction
        .update(marketplaceClaims)
        .set(claimValues(claim))
        .where(eq(marketplaceClaims.id, previous.id));
    }
    if (moment !== null) {
      await queueClaimNotices(transaction, {
        tenantId: store.tenantId,
        order,
        externalClaimId: claim.externalClaimId,
        moment,
      });
    }
    return { saved: previous === undefined ? "created" : "updated", moment };
  });
}

/** Connected Mercado Livre stores with a live token: the daily claim search reads each one. */
export async function listClaimSweepStores(database: Database) {
  return database
    .select({
      id: storeConnections.id,
      tenantId: storeConnections.tenantId,
      externalShopId: storeConnections.externalShopId,
      accessTokenEnc: storeConnections.accessTokenEnc,
    })
    .from(storeConnections)
    .where(
      and(
        eq(storeConnections.marketplace, "mercado_livre"),
        eq(storeConnections.status, "connected"),
        isNotNull(storeConnections.accessTokenEnc),
        or(isNull(storeConnections.expiresAt), gt(storeConnections.expiresAt, new Date())),
      ),
    )
    .orderBy(asc(storeConnections.id));
}

const claimViewColumns = {
  externalClaimId: marketplaceClaims.externalClaimId,
  status: marketplaceClaims.status,
  type: marketplaceClaims.type,
  stage: marketplaceClaims.stage,
  reasonId: marketplaceClaims.reasonId,
  problem: marketplaceClaims.problem,
  actionResponsible: marketplaceClaims.actionResponsible,
  actionDueAt: marketplaceClaims.actionDueAt,
  resolutionReason: marketplaceClaims.resolutionReason,
  closedAt: marketplaceClaims.closedAt,
  returnStatus: marketplaceClaims.returnStatus,
  returnTrackingCode: marketplaceClaims.returnTrackingCode,
  returnDestination: marketplaceClaims.returnDestination,
  moneyStatus: marketplaceClaims.moneyStatus,
  openedAt: marketplaceClaims.openedAt,
};

export type MarketplaceClaimView = Awaited<ReturnType<typeof listOrderClaims>>[number];

/** The claims of one order of the tenant, the most recent first; none for another tenant's order. */
export async function listOrderClaims(
  database: Database,
  input: { tenantId: string; orderId: string },
) {
  return database
    .select(claimViewColumns)
    .from(marketplaceClaims)
    .where(
      and(
        eq(marketplaceClaims.tenantId, input.tenantId),
        eq(marketplaceClaims.orderId, input.orderId),
      ),
    )
    .orderBy(desc(marketplaceClaims.openedAt));
}

/** The claims on the order of one of the supplier's parcels; none for another supplier's parcel. */
export async function listSupplierParcelClaims(
  database: Database,
  input: { supplierId: string; shipmentId: string },
) {
  return database
    .select(claimViewColumns)
    .from(marketplaceClaims)
    .innerJoin(
      orderShipments,
      and(
        eq(orderShipments.orderId, marketplaceClaims.orderId),
        eq(orderShipments.tenantId, marketplaceClaims.tenantId),
      ),
    )
    .where(
      and(eq(orderShipments.id, input.shipmentId), eq(orderShipments.supplierId, input.supplierId)),
    )
    .orderBy(desc(marketplaceClaims.openedAt));
}
