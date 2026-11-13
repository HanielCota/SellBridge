import { readProductFiscal, type ProductFiscal } from "@sellbridge/shared/product-fiscal";
import type { DeliveryAddress } from "@sellbridge/shared/schemas";
import {
  readSupplierFiscalProfile,
  type SupplierFiscalProfile,
} from "@sellbridge/shared/supplier-fiscal";
import { invoiceAuthorizedContent } from "@sellbridge/shared/notification-events";
import type { InvoiceStatus } from "@sellbridge/shared/supplier-invoice";
import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, notInArray, sql } from "drizzle-orm";
import type { Database, DatabaseExecutor } from "../client.ts";
import {
  orderItems,
  orders,
  orderShipments,
  shipmentInvoices,
  storeConnections,
  supplierErpConnections,
  supplierProducts,
  suppliers,
} from "../schema/index.ts";
import { notifyWorkspace } from "./notification-producers.ts";

/** Parcels in these states are not invoiced: the sale did not go ahead. */
const UNINVOICED_SHIPMENT_STATUSES = ["cancelled", "returned", "not_delivered"] as const;
const UNINVOICED_ORDER_STATUSES = ["pending", "cancelled", "returned"] as const;

/**
 * Opens an invoice for each new parcel of a supplier whose ERP issues its notes: parcels created
 * since the supplier turned it on, still going ahead, without one yet. Returns how many.
 */
export async function queueNewShipmentInvoices(database: Database): Promise<number> {
  const candidates = await database
    .select({
      shipmentId: orderShipments.id,
      supplierId: orderShipments.supplierId,
      provider: supplierErpConnections.provider,
    })
    .from(orderShipments)
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
    .leftJoin(shipmentInvoices, eq(shipmentInvoices.shipmentId, orderShipments.id))
    .where(
      and(
        isNull(shipmentInvoices.id),
        notInArray(orderShipments.status, [...UNINVOICED_SHIPMENT_STATUSES]),
        notInArray(orders.status, [...UNINVOICED_ORDER_STATUSES]),
      ),
    );
  if (candidates.length === 0) {
    return 0;
  }
  const inserted = await database
    .insert(shipmentInvoices)
    .values(candidates)
    .onConflictDoNothing({ target: shipmentInvoices.shipmentId })
    .returning({ id: shipmentInvoices.id });
  return inserted.length;
}

/**
 * Takes up to `limit` invoices due for a step and leases them: the next attempt moves
 * `leaseMilliseconds` ahead (a crashed run is picked up again), and `SKIP LOCKED` keeps two
 * workers apart.
 */
export async function claimDueShipmentInvoices(
  database: Database,
  claim: { now: Date; limit: number; leaseMilliseconds: number },
): Promise<string[]> {
  return database.transaction(async (transaction) => {
    const due = await transaction
      .select({ id: shipmentInvoices.id })
      .from(shipmentInvoices)
      .where(
        and(
          inArray(shipmentInvoices.status, ["queued", "sent"]),
          lte(
            shipmentInvoices.nextAttemptAt,
            sql`greatest(${claim.now.toISOString()}::timestamptz, now())`,
          ),
        ),
      )
      .orderBy(asc(shipmentInvoices.nextAttemptAt))
      .limit(claim.limit)
      .for("update", { skipLocked: true });
    if (due.length === 0) {
      return [];
    }
    const ids = due.map((row) => row.id);
    await transaction
      .update(shipmentInvoices)
      .set({ nextAttemptAt: new Date(claim.now.getTime() + claim.leaseMilliseconds) })
      .where(inArray(shipmentInvoices.id, ids));
    return ids;
  });
}

/** Notes that still wait for a step from the job: the ones it claims. */
const WAITING_INVOICE_STATUSES: readonly InvoiceStatus[] = ["queued", "sent"];

/** Namespace of the per-invoice advisory locks, so they never meet another feature's locks. */
const INVOICE_LOCK_NAMESPACE = 7_310_481;

/**
 * Runs `work` while this connection holds the invoice's lock, or returns false at once when
 * another run holds it. The lease alone is a time window: a slow run that outlived it would be
 * joined by the next one, and both would create the note in the ERP. The lock lasts as long as
 * the work, and a crashed process releases it with its connection.
 */
export async function whileHoldingShipmentInvoice(
  database: Database,
  invoiceId: string,
  work: () => Promise<void>,
): Promise<boolean> {
  return database.transaction(async (transaction) => {
    const [row] = await transaction.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(${INVOICE_LOCK_NAMESPACE}, hashtext(${invoiceId})) as locked`,
    );
    if (row?.locked !== true) {
      return false;
    }
    // A run that claimed the note before another one stopped or finished it must leave it alone.
    const [current] = await transaction
      .select({ status: shipmentInvoices.status })
      .from(shipmentInvoices)
      .where(eq(shipmentInvoices.id, invoiceId));
    if (current === undefined || !WAITING_INVOICE_STATUSES.includes(current.status)) {
      return false;
    }
    await work();
    return true;
  });
}

/** One line of the note: the parcel's item with its price and the product's fiscal data. */
export interface ShipmentInvoiceLine {
  readonly sku: string;
  readonly title: string;
  readonly quantity: number;
  /** What the buyer paid per unit, in cents. */
  readonly unitPriceCents: number;
  /** What the reseller pays the supplier per unit, in cents. */
  readonly unitCostCents: number;
  readonly fiscal: ProductFiscal;
}

/** Everything the job needs to take an invoice one step further. */
export interface ShipmentInvoiceWork {
  readonly id: string;
  readonly status: InvoiceStatus;
  readonly attempts: number;
  readonly erpContactId: number | null;
  readonly erpOrderId: number | null;
  readonly erpInvoiceId: number | null;
  readonly supplierId: string;
  readonly supplierFiscal: SupplierFiscalProfile | null;
  readonly shipmentId: string;
  readonly address: DeliveryAddress;
  readonly externalOrderId: string;
  readonly orderedAt: Date;
  readonly buyerName: string | null;
  readonly store: {
    readonly id: string;
    readonly marketplace: string;
    readonly externalShopId: string;
    readonly accessTokenEnc: string | null;
  };
  readonly lines: readonly ShipmentInvoiceLine[];
  /** Neither the order nor the parcel was cancelled, returned or left undelivered. */
  readonly saleGoesAhead: boolean;
  /** The supplier's ERP account is still linked and connected. */
  readonly erpConnected: boolean;
  /** The supplier still has emission through the ERP turned on. */
  readonly emissionOn: boolean;
  /** Parcel items with no matching order line. */
  readonly missingLines: number;
}

async function invoiceHeader(database: Database, invoiceId: string) {
  const [row] = await database
    .select({
      invoice: shipmentInvoices,
      fiscalProfile: suppliers.fiscalProfile,
      address: orderShipments.address,
      items: orderShipments.items,
      shipmentStatus: orderShipments.status,
      orderStatus: orders.status,
      erpStatus: supplierErpConnections.status,
      invoiceEnabledAt: supplierErpConnections.invoiceEnabledAt,
      orderId: orders.id,
      externalOrderId: orders.externalOrderId,
      orderedAt: orders.orderedAt,
      buyerName: orders.buyerName,
      store: {
        id: storeConnections.id,
        marketplace: storeConnections.marketplace,
        externalShopId: storeConnections.externalShopId,
        accessTokenEnc: storeConnections.accessTokenEnc,
      },
    })
    .from(shipmentInvoices)
    .innerJoin(orderShipments, eq(orderShipments.id, shipmentInvoices.shipmentId))
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .innerJoin(storeConnections, eq(storeConnections.id, orders.storeConnectionId))
    .innerJoin(suppliers, eq(suppliers.id, shipmentInvoices.supplierId))
    // A left join: a note whose ERP was disconnected still loads, to tell the supplier so.
    .leftJoin(
      supplierErpConnections,
      and(
        eq(supplierErpConnections.supplierId, shipmentInvoices.supplierId),
        eq(supplierErpConnections.provider, shipmentInvoices.provider),
      ),
    )
    .where(eq(shipmentInvoices.id, invoiceId));
  return row;
}

async function invoiceLines(
  database: Database,
  orderId: string,
  items: readonly { orderItemId: string; sku: string; title: string; quantity: number }[],
): Promise<ShipmentInvoiceLine[]> {
  if (items.length === 0) {
    return [];
  }
  const rows = await database
    .select({
      id: orderItems.id,
      unitPriceCents: orderItems.unitPriceCents,
      unitCostCents: orderItems.unitCostCents,
      fiscal: supplierProducts.fiscal,
    })
    .from(orderItems)
    .leftJoin(supplierProducts, eq(supplierProducts.id, orderItems.supplierProductId))
    .where(
      and(
        eq(orderItems.orderId, orderId),
        inArray(
          orderItems.id,
          items.map((item) => item.orderItemId),
        ),
      ),
    );
  const byId = new Map(rows.map((row) => [row.id, row]));
  return items.flatMap((item) => {
    const row = byId.get(item.orderItemId);
    if (row === undefined) {
      return [];
    }
    return [
      {
        sku: item.sku,
        title: item.title,
        quantity: item.quantity,
        unitPriceCents: row.unitPriceCents,
        unitCostCents: row.unitCostCents,
        fiscal: readProductFiscal(row.fiscal),
      },
    ];
  });
}

function isOneOf(value: string, values: readonly string[]): boolean {
  return values.some((candidate) => candidate === value);
}

/**
 * The invoice with its parcel, order, store, supplier profile and lines, and what the job checks
 * again before each step; null when it no longer exists (its parcel was deleted).
 */
export async function loadShipmentInvoiceWork(
  database: Database,
  invoiceId: string,
): Promise<ShipmentInvoiceWork | null> {
  const header = await invoiceHeader(database, invoiceId);
  if (header === undefined) {
    return null;
  }
  const { invoice } = header;
  const lines = await invoiceLines(database, header.orderId, header.items);
  return {
    id: invoice.id,
    status: invoice.status,
    attempts: invoice.attempts,
    erpContactId: invoice.erpContactId,
    erpOrderId: invoice.erpOrderId,
    erpInvoiceId: invoice.erpInvoiceId,
    supplierId: invoice.supplierId,
    supplierFiscal: readSupplierFiscalProfile(header.fiscalProfile),
    shipmentId: invoice.shipmentId,
    address: header.address,
    externalOrderId: header.externalOrderId,
    orderedAt: header.orderedAt,
    buyerName: header.buyerName,
    store: header.store,
    lines,
    saleGoesAhead:
      !isOneOf(header.shipmentStatus, UNINVOICED_SHIPMENT_STATUSES) &&
      !isOneOf(header.orderStatus, UNINVOICED_ORDER_STATUSES),
    erpConnected: header.erpStatus === "connected",
    emissionOn: header.invoiceEnabledAt !== null,
    missingLines: header.items.length - lines.length,
  };
}

/** The ERP ids a step produced; a later retry goes on from there. */
export async function recordShipmentInvoiceProgress(
  database: Database,
  invoiceId: string,
  progress: { erpContactId?: number; erpOrderId?: number; erpInvoiceId?: number },
): Promise<void> {
  await database.update(shipmentInvoices).set(progress).where(eq(shipmentInvoices.id, invoiceId));
}

/** Handed to SEFAZ: the job asks for its answer again at `checkAt`. */
export async function markShipmentInvoiceSent(
  database: Database,
  input: { invoiceId: string; checkAt: Date },
): Promise<void> {
  await database
    .update(shipmentInvoices)
    .set({ status: "sent", attempts: 0, problem: null, nextAttemptAt: input.checkAt })
    .where(eq(shipmentInvoices.id, input.invoiceId));
}

/** Tells the reseller's workspace the note is out; the e-mail carries its XML and DANFE. */
async function queueInvoiceAuthorizedNotice(
  transaction: DatabaseExecutor,
  input: { invoiceId: string; number: string },
): Promise<void> {
  const [parcel] = await transaction
    .select({
      tenantId: orderShipments.tenantId,
      orderId: orderShipments.orderId,
      shipmentId: orderShipments.id,
      externalOrderId: orders.externalOrderId,
      supplierName: suppliers.name,
    })
    .from(shipmentInvoices)
    .innerJoin(orderShipments, eq(orderShipments.id, shipmentInvoices.shipmentId))
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .innerJoin(suppliers, eq(suppliers.id, shipmentInvoices.supplierId))
    .where(eq(shipmentInvoices.id, input.invoiceId));
  if (parcel === undefined) {
    return;
  }
  const { tenantId, ...notice } = parcel;
  await notifyWorkspace(transaction, {
    tenantId,
    event: "invoice_authorized",
    dedupeKey: `invoice_authorized:${input.invoiceId}`,
    content: invoiceAuthorizedContent({ ...notice, invoiceNumber: input.number }),
  });
}

/** Authorized by SEFAZ: saved with what the screens show, and the reseller is told. */
export async function markShipmentInvoiceAuthorized(
  database: Database,
  input: {
    invoiceId: string;
    number: string;
    series: string | null;
    accessKey: string | null;
    danfeUrl: string | null;
    authorizedAt: Date;
  },
): Promise<void> {
  await database.transaction(async (transaction) => {
    await transaction
      .update(shipmentInvoices)
      .set({
        status: "authorized",
        number: input.number,
        series: input.series,
        accessKey: input.accessKey,
        danfeUrl: input.danfeUrl,
        authorizedAt: input.authorizedAt,
        problem: null,
        attempts: 0,
      })
      .where(eq(shipmentInvoices.id, input.invoiceId));
    await queueInvoiceAuthorizedNotice(transaction, input);
  });
}

/** Cancelled in the ERP; nothing more happens to it here. */
export async function markShipmentInvoiceCancelled(
  database: Database,
  invoiceId: string,
): Promise<void> {
  await database
    .update(shipmentInvoices)
    .set({ status: "cancelled", problem: null })
    .where(eq(shipmentInvoices.id, invoiceId));
}

/** Stopped until the supplier acts; `problem` says what to do, in their words. */
export async function markShipmentInvoiceAttention(
  database: Database,
  input: { invoiceId: string; problem: string },
): Promise<void> {
  await database
    .update(shipmentInvoices)
    .set({ status: "attention", problem: input.problem })
    .where(eq(shipmentInvoices.id, input.invoiceId));
}

/** A passing failure: tried again at `retryAt`, counting the attempt. */
export async function scheduleShipmentInvoiceRetry(
  database: Database,
  input: { invoiceId: string; attempts: number; retryAt: Date },
): Promise<void> {
  await database
    .update(shipmentInvoices)
    .set({ attempts: input.attempts, nextAttemptAt: input.retryAt })
    .where(eq(shipmentInvoices.id, input.invoiceId));
}

/** The note of one of the supplier's parcels, as the order screen shows it; null when none. */
export async function findSupplierShipmentInvoice(
  database: Database,
  input: { supplierId: string; shipmentId: string },
) {
  const [row] = await database
    .select({
      status: shipmentInvoices.status,
      number: shipmentInvoices.number,
      series: shipmentInvoices.series,
      accessKey: shipmentInvoices.accessKey,
      danfeUrl: shipmentInvoices.danfeUrl,
      problem: shipmentInvoices.problem,
      authorizedAt: shipmentInvoices.authorizedAt,
      updatedAt: shipmentInvoices.updatedAt,
    })
    .from(shipmentInvoices)
    .where(
      and(
        eq(shipmentInvoices.shipmentId, input.shipmentId),
        eq(shipmentInvoices.supplierId, input.supplierId),
      ),
    );
  return row ?? null;
}

/**
 * Sends a stopped note back to the job, after the supplier fixed what its problem said. Only a
 * note in "attention" goes back; another supplier's parcel is "not found".
 *
 * @throws {AppError} NOT_FOUND when the parcel has no note of this supplier; CONFLICT when the
 * note is not stopped.
 */
export async function retrySupplierShipmentInvoice(
  database: Database,
  input: { supplierId: string; shipmentId: string },
): Promise<void> {
  const updated = await database
    .update(shipmentInvoices)
    .set({ status: "queued", problem: null, attempts: 0, nextAttemptAt: new Date() })
    .where(
      and(
        eq(shipmentInvoices.shipmentId, input.shipmentId),
        eq(shipmentInvoices.supplierId, input.supplierId),
        eq(shipmentInvoices.status, "attention"),
      ),
    )
    .returning({ id: shipmentInvoices.id });
  if (updated.length > 0) {
    return;
  }
  const existing = await findSupplierShipmentInvoice(database, input);
  if (existing === null) {
    throw notFoundError("Este pedido não tem nota fiscal para tentar de novo.");
  }
  throw conflictError("A nota deste pedido não está parada. Atualize a tela.");
}

/**
 * Turns the ERP's NF-e emission on (from now: earlier parcels stay out) or off. Returns whether
 * the supplier has a connection to change.
 */
export async function setErpInvoicing(
  database: Database,
  input: { supplierId: string; enabled: boolean; now?: Date },
): Promise<boolean> {
  const updated = await database
    .update(supplierErpConnections)
    .set({
      // Turning it on again keeps the first date: parcels in between stay invoiced.
      invoiceEnabledAt: input.enabled
        ? sql`coalesce(${supplierErpConnections.invoiceEnabledAt}, ${(input.now ?? new Date()).toISOString()}::timestamptz)`
        : null,
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

/** An authorized note as the reseller's order page shows it. */
export interface AuthorizedShipmentInvoice {
  readonly number: string | null;
  readonly series: string | null;
  readonly accessKey: string | null;
  readonly authorizedAt: Date | null;
}

/** The authorized notes of these parcels, by parcel; parcels without one are left out. */
export async function authorizedShipmentInvoices(
  database: Database,
  shipmentIds: readonly string[],
): Promise<Map<string, AuthorizedShipmentInvoice>> {
  if (shipmentIds.length === 0) {
    return new Map();
  }
  const rows = await database
    .select({
      shipmentId: shipmentInvoices.shipmentId,
      number: shipmentInvoices.number,
      series: shipmentInvoices.series,
      accessKey: shipmentInvoices.accessKey,
      authorizedAt: shipmentInvoices.authorizedAt,
    })
    .from(shipmentInvoices)
    .where(
      and(
        inArray(shipmentInvoices.shipmentId, [...shipmentIds]),
        eq(shipmentInvoices.status, "authorized"),
      ),
    );
  return new Map(rows.map(({ shipmentId, ...invoice }) => [shipmentId, invoice]));
}

/** Who may download an authorized note's files, and the key Bling finds them by. */
export interface ShipmentInvoiceFiles {
  readonly shipmentId: string;
  readonly orderId: string;
  /** The reseller's workspace. */
  readonly tenantId: string;
  readonly supplierId: string;
  readonly number: string | null;
  readonly accessKey: string;
}

/** The parcel's authorized note with its access key; null while it has none. */
export async function findShipmentInvoiceFiles(
  database: Database,
  shipmentId: string,
): Promise<ShipmentInvoiceFiles | null> {
  const [row] = await database
    .select({
      shipmentId: orderShipments.id,
      orderId: orderShipments.orderId,
      tenantId: orderShipments.tenantId,
      supplierId: shipmentInvoices.supplierId,
      number: shipmentInvoices.number,
      accessKey: shipmentInvoices.accessKey,
    })
    .from(shipmentInvoices)
    .innerJoin(orderShipments, eq(orderShipments.id, shipmentInvoices.shipmentId))
    .where(
      and(eq(shipmentInvoices.shipmentId, shipmentId), eq(shipmentInvoices.status, "authorized")),
    );
  if (row === undefined || row.accessKey === null) {
    return null;
  }
  return { ...row, accessKey: row.accessKey };
}
