import type { BillingAddress } from "@sellbridge/shared/billing-address";
import type { OnBehalfLabelParcel } from "@sellbridge/shared/reseller-invoice";
import type { InvoiceKind } from "@sellbridge/shared/supplier-invoice";
import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import { and, eq, gte, isNotNull, isNull, ne, notInArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Database } from "../client.ts";
import {
  orders,
  orderShipments,
  shipmentInvoices,
  shipmentResellerInvoices,
  storeConnections,
  supplierErpConnections,
  tenantProfile,
  user,
} from "../schema/index.ts";
import { UNINVOICED_ORDER_STATUSES, UNINVOICED_SHIPMENT_STATUSES } from "./sql/uninvoiced.ts";

const saleGoesAhead = and(
  notInArray(orderShipments.status, [...UNINVOICED_SHIPMENT_STATUSES]),
  notInArray(orders.status, [...UNINVOICED_ORDER_STATUSES]),
);

/**
 * Opens the remessa (supplier → buyer) of each venda à ordem parcel whose reseller note was
 * found, while the supplier's ERP issues its notes and the sale goes ahead. On Mercado Livre the
 * note must be there first (a typed key never reaches it): until then the reseller may still
 * replace it, and the remessa would cite a note Mercado Livre does not have.
 */
async function queueOnBehalfShipments(database: Database): Promise<number> {
  const candidates = await database
    .select({
      shipmentId: orderShipments.id,
      supplierId: orderShipments.supplierId,
      provider: supplierErpConnections.provider,
    })
    .from(orderShipments)
    .innerJoin(
      shipmentResellerInvoices,
      and(
        eq(shipmentResellerInvoices.shipmentId, orderShipments.id),
        isNotNull(shipmentResellerInvoices.accessKey),
      ),
    )
    .innerJoin(
      supplierErpConnections,
      and(
        eq(supplierErpConnections.supplierId, orderShipments.supplierId),
        eq(supplierErpConnections.status, "connected"),
        isNotNull(supplierErpConnections.invoiceEnabledAt),
        gte(orderShipments.createdAt, supplierErpConnections.invoiceEnabledAt),
      ),
    )
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .innerJoin(storeConnections, eq(storeConnections.id, orders.storeConnectionId))
    .leftJoin(
      shipmentInvoices,
      and(
        eq(shipmentInvoices.shipmentId, orderShipments.id),
        eq(shipmentInvoices.kind, "on_behalf_shipment"),
      ),
    )
    .where(
      and(
        isNull(shipmentInvoices.id),
        saleGoesAhead,
        or(
          ne(storeConnections.marketplace, "mercado_livre"),
          ne(shipmentResellerInvoices.source, "typed"),
        ),
      ),
    );
  return insertNotes(database, candidates, "on_behalf_shipment");
}

/** Opens the sale to the reseller of each parcel whose remessa SEFAZ authorized. */
async function queueOnBehalfSales(database: Database): Promise<number> {
  const remessa = alias(shipmentInvoices, "remessa");
  const candidates = await database
    .select({
      shipmentId: remessa.shipmentId,
      supplierId: remessa.supplierId,
      provider: remessa.provider,
    })
    .from(remessa)
    .innerJoin(orderShipments, eq(orderShipments.id, remessa.shipmentId))
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .leftJoin(
      shipmentInvoices,
      and(
        eq(shipmentInvoices.shipmentId, remessa.shipmentId),
        eq(shipmentInvoices.kind, "on_behalf_sale"),
      ),
    )
    .where(
      and(
        eq(remessa.kind, "on_behalf_shipment"),
        eq(remessa.status, "authorized"),
        isNotNull(remessa.accessKey),
        isNull(shipmentInvoices.id),
        saleGoesAhead,
      ),
    );
  return insertNotes(database, candidates, "on_behalf_sale");
}

async function insertNotes(
  database: Database,
  candidates: readonly { shipmentId: string; supplierId: string; provider: "bling" }[],
  kind: InvoiceKind,
): Promise<number> {
  if (candidates.length === 0) {
    return 0;
  }
  const inserted = await database
    .insert(shipmentInvoices)
    .values(candidates.map((candidate) => ({ ...candidate, kind })))
    .onConflictDoNothing({ target: [shipmentInvoices.shipmentId, shipmentInvoices.kind] })
    .returning({ id: shipmentInvoices.id });
  return inserted.length;
}

/**
 * Opens the supplier's notes of venda à ordem, each when the one it cites exists: the remessa once
 * the reseller's sale note is found, the sale to the reseller once the remessa is authorized.
 * Returns how many were opened.
 */
export async function queueOnBehalfInvoices(database: Database): Promise<number> {
  const remessas = await queueOnBehalfShipments(database);
  const sales = await queueOnBehalfSales(database);
  return remessas + sales;
}

/** A note another one cites: its key and, when known, its number and series. */
export interface CitedInvoice {
  readonly accessKey: string;
  readonly number: string | null;
  readonly series: string | null;
}

/** The reseller's company, the recipient of the sale in venda à ordem. */
export interface OnBehalfReseller {
  /** Digits. */
  readonly cnpj: string;
  readonly legalName: string;
  /** Digits, or "ISENTO"; null for a company saved before it was asked. */
  readonly stateRegistration: string | null;
  readonly address: BillingAddress | null;
}

/** What the supplier's venda à ordem notes need besides the parcel itself. */
export interface OnBehalfInvoiceContext {
  /** The reseller's own sale note, which the remessa cites; null while it is not found. */
  readonly resellerNote: CitedInvoice | null;
  /** The authorized remessa, which the sale to the reseller cites; null until then. */
  readonly shipmentNote: (CitedInvoice & { readonly createdAt: Date }) | null;
  /** Null when the reseller no longer sells as a company. */
  readonly reseller: OnBehalfReseller | null;
  /** The supplier ERP's operations ("naturezas de operação"); null until chosen. */
  readonly shipmentOperationId: number | null;
  readonly saleOperationId: number | null;
}

async function resellerNoteOf(database: Database, shipmentId: string) {
  const [row] = await database
    .select({
      accessKey: shipmentResellerInvoices.accessKey,
      number: shipmentResellerInvoices.number,
      series: shipmentResellerInvoices.series,
    })
    .from(shipmentResellerInvoices)
    .where(eq(shipmentResellerInvoices.shipmentId, shipmentId));
  if (row === undefined || row.accessKey === null) {
    return null;
  }
  return { ...row, accessKey: row.accessKey };
}

async function shipmentNoteOf(database: Database, shipmentId: string) {
  const [row] = await database
    .select({
      accessKey: shipmentInvoices.accessKey,
      number: shipmentInvoices.number,
      series: shipmentInvoices.series,
      createdAt: shipmentInvoices.createdAt,
    })
    .from(shipmentInvoices)
    .where(
      and(
        eq(shipmentInvoices.shipmentId, shipmentId),
        eq(shipmentInvoices.kind, "on_behalf_shipment"),
        eq(shipmentInvoices.status, "authorized"),
      ),
    );
  if (row === undefined || row.accessKey === null) {
    return null;
  }
  return { ...row, accessKey: row.accessKey };
}

async function resellerOf(database: Database, tenantId: string): Promise<OnBehalfReseller | null> {
  const [row] = await database
    .select({
      cnpj: tenantProfile.cnpj,
      legalName: tenantProfile.companyName,
      stateRegistration: tenantProfile.stateRegistration,
      address: tenantProfile.billingAddress,
    })
    .from(tenantProfile)
    .where(eq(tenantProfile.tenantId, tenantId));
  if (row === undefined || row.cnpj === null || row.legalName === null) {
    return null;
  }
  return { ...row, cnpj: row.cnpj, legalName: row.legalName };
}

async function operationsOf(database: Database, supplierId: string) {
  const [row] = await database
    .select({
      shipmentOperationId: supplierErpConnections.onBehalfShipmentOperationId,
      saleOperationId: supplierErpConnections.onBehalfSaleOperationId,
    })
    .from(supplierErpConnections)
    .where(
      and(
        eq(supplierErpConnections.supplierId, supplierId),
        eq(supplierErpConnections.provider, "bling"),
      ),
    );
  return row ?? { shipmentOperationId: null, saleOperationId: null };
}

/** The notes, company and ERP operations a venda à ordem note of this parcel builds on. */
export async function loadOnBehalfInvoiceContext(
  database: Database,
  input: { shipmentId: string; tenantId: string; supplierId: string },
): Promise<OnBehalfInvoiceContext> {
  const [resellerNote, shipmentNote, reseller, operations] = await Promise.all([
    resellerNoteOf(database, input.shipmentId),
    shipmentNoteOf(database, input.shipmentId),
    resellerOf(database, input.tenantId),
    operationsOf(database, input.supplierId),
  ]);
  return { resellerNote, shipmentNote, reseller, ...operations };
}

/**
 * Sets the supplier ERP's two operations of venda à ordem. Returns whether the supplier has a
 * connection to change.
 */
export async function setOnBehalfOperations(
  database: Database,
  input: { supplierId: string; shipmentOperationId: number; saleOperationId: number },
): Promise<boolean> {
  const updated = await database
    .update(supplierErpConnections)
    .set({
      onBehalfShipmentOperationId: input.shipmentOperationId,
      onBehalfSaleOperationId: input.saleOperationId,
    })
    .where(
      and(
        eq(supplierErpConnections.supplierId, input.supplierId),
        eq(supplierErpConnections.provider, "bling"),
      ),
    )
    .returning({ id: supplierErpConnections.id });
  return updated.length > 0;
}

/**
 * Whether the parcel is sold in venda à ordem and its reseller's sale note was found: null for a
 * parcel of the direct note, which has no reseller note at all.
 */
export async function findResellerNoteState(
  database: Database,
  shipmentId: string,
): Promise<{ found: boolean } | null> {
  const [row] = await database
    .select({ accessKey: shipmentResellerInvoices.accessKey })
    .from(shipmentResellerInvoices)
    .where(eq(shipmentResellerInvoices.shipmentId, shipmentId));
  return row === undefined ? null : { found: row.accessKey !== null };
}

/**
 * The venda à ordem parcels behind an order's label: where the reseller's note came from and
 * whether the remessa is authorized. A Mercado Livre cart has one label for all its orders, so
 * every parcel of the cart counts. Empty for labels of direct notes only.
 */
export async function findOnBehalfLabelParcels(
  database: Database,
  input: { tenantId: string; orderId: string },
): Promise<OnBehalfLabelParcel[]> {
  const [order] = await database
    .select({ storeConnectionId: orders.storeConnectionId, packId: orders.marketplacePackId })
    .from(orders)
    .where(and(eq(orders.id, input.orderId), eq(orders.tenantId, input.tenantId)));
  if (order === undefined) {
    return [];
  }
  const sameLabel =
    order.packId === null
      ? eq(orders.id, input.orderId)
      : and(
          eq(orders.storeConnectionId, order.storeConnectionId),
          eq(orders.marketplacePackId, order.packId),
        );
  const remessa = alias(shipmentInvoices, "label_remessa");
  const rows = await database
    .select({
      resellerNoteSource: shipmentResellerInvoices.source,
      remessaStatus: remessa.status,
      labelReleasedAt: shipmentResellerInvoices.labelReleasedAt,
    })
    .from(shipmentResellerInvoices)
    .innerJoin(orderShipments, eq(orderShipments.id, shipmentResellerInvoices.shipmentId))
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .leftJoin(
      remessa,
      and(eq(remessa.shipmentId, orderShipments.id), eq(remessa.kind, "on_behalf_shipment")),
    )
    .where(and(eq(orders.tenantId, input.tenantId), sameLabel));
  return rows.map((row) => ({
    resellerNoteSource: row.resellerNoteSource,
    remessaAuthorized: row.remessaStatus === "authorized",
    labelReleased: row.labelReleasedAt !== null,
  }));
}

/** A venda à ordem parcel's label as the team sees it in Admin › Envios. */
export interface OnBehalfLabelState {
  readonly tenantId: string;
  readonly orderId: string;
  readonly marketplace: string;
  /** Who let the label out although a note was stuck, when and why; null while it waits. */
  readonly release: {
    readonly at: Date;
    readonly byName: string | null;
    readonly reason: string;
  } | null;
}

/** The parcel's label state, or null when the parcel is not sold in venda à ordem. */
export async function findOnBehalfLabelState(
  database: Database,
  shipmentId: string,
): Promise<OnBehalfLabelState | null> {
  const releasedBy = alias(user, "label_released_by");
  const [row] = await database
    .select({
      tenantId: orderShipments.tenantId,
      orderId: orderShipments.orderId,
      marketplace: storeConnections.marketplace,
      releasedAt: shipmentResellerInvoices.labelReleasedAt,
      releasedByName: releasedBy.name,
      reason: shipmentResellerInvoices.labelReleaseReason,
    })
    .from(shipmentResellerInvoices)
    .innerJoin(orderShipments, eq(orderShipments.id, shipmentResellerInvoices.shipmentId))
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .innerJoin(storeConnections, eq(storeConnections.id, orders.storeConnectionId))
    .leftJoin(releasedBy, eq(releasedBy.id, shipmentResellerInvoices.labelReleasedByUserId))
    .where(eq(shipmentResellerInvoices.shipmentId, shipmentId));
  if (row === undefined) {
    return null;
  }
  const release =
    row.releasedAt === null
      ? null
      : { at: row.releasedAt, byName: row.releasedByName, reason: row.reason ?? "" };
  return {
    tenantId: row.tenantId,
    orderId: row.orderId,
    marketplace: row.marketplace,
    release,
  };
}

/**
 * Lets a venda à ordem parcel's label out although a note is stuck, keeping who did it and why.
 *
 * @throws {AppError} NOT_FOUND when the parcel is not sold in venda à ordem; CONFLICT when its
 * label was already released.
 */
export async function releaseOnBehalfLabel(
  database: Database,
  release: { shipmentId: string; userId: string; reason: string; now: Date },
): Promise<void> {
  const updated = await database
    .update(shipmentResellerInvoices)
    .set({
      labelReleasedAt: release.now,
      labelReleasedByUserId: release.userId,
      labelReleaseReason: release.reason,
    })
    .where(
      and(
        eq(shipmentResellerInvoices.shipmentId, release.shipmentId),
        isNull(shipmentResellerInvoices.labelReleasedAt),
      ),
    )
    .returning({ id: shipmentResellerInvoices.id });
  if (updated.length > 0) {
    return;
  }
  const [existing] = await database
    .select({ id: shipmentResellerInvoices.id })
    .from(shipmentResellerInvoices)
    .where(eq(shipmentResellerInvoices.shipmentId, release.shipmentId));
  if (existing === undefined) {
    throw notFoundError("Este envio não é de venda à ordem");
  }
  throw conflictError("A etiqueta deste envio já foi liberada");
}

/**
 * Marks the remessa as asked of the ERP, only while the reseller's note is still `citedAccessKey`
 * (the one the remessa will cite) and, on Mercado Livre, is there and not only typed. It holds the
 * note's row meanwhile, as replacing the note does, so a note replaced in between is seen here or
 * there, never missed by both. Returns false when the remessa must not start now: when the note
 * changed it is built again with the new one; when a Mercado Livre note went back to typed, the
 * queued remessa is dropped (nothing was asked of the ERP yet) and opens again once the note is
 * on Mercado Livre.
 */
export async function claimOnBehalfRemessaDraft(
  database: Database,
  claim: { invoiceId: string; shipmentId: string; citedAccessKey: string; now: Date },
): Promise<boolean> {
  return database.transaction(async (transaction) => {
    const [note] = await transaction
      .select({
        accessKey: shipmentResellerInvoices.accessKey,
        source: shipmentResellerInvoices.source,
        marketplace: storeConnections.marketplace,
      })
      .from(shipmentResellerInvoices)
      .innerJoin(orderShipments, eq(orderShipments.id, shipmentResellerInvoices.shipmentId))
      .innerJoin(orders, eq(orders.id, orderShipments.orderId))
      .innerJoin(storeConnections, eq(storeConnections.id, orders.storeConnectionId))
      .where(eq(shipmentResellerInvoices.shipmentId, claim.shipmentId))
      .for("update", { of: shipmentResellerInvoices });
    if (note?.accessKey !== claim.citedAccessKey) {
      return false;
    }
    if (note.marketplace === "mercado_livre" && note.source === "typed") {
      await transaction.delete(shipmentInvoices).where(eq(shipmentInvoices.id, claim.invoiceId));
      return false;
    }
    await transaction
      .update(shipmentInvoices)
      .set({ erpDraftRequestedAt: claim.now })
      .where(eq(shipmentInvoices.id, claim.invoiceId));
    return true;
  });
}
