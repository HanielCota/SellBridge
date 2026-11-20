import { readProductFiscal, type ProductFiscal } from "@sellbridge/shared/product-fiscal";
import type { DeliveryAddress } from "@sellbridge/shared/schemas";
import {
  readSupplierFiscalProfile,
  type SupplierFiscalProfile,
} from "@sellbridge/shared/supplier-fiscal";
import {
  invoiceAttentionContent,
  invoiceAuthorizedContent,
} from "@sellbridge/shared/notification-events";
import {
  BOX_INVOICE_KINDS,
  parcelNoteKinds,
  type InvoiceKind,
  type InvoiceStatus,
  type ParcelNote,
} from "@sellbridge/shared/supplier-invoice";
import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
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
import {
  loadOnBehalfInvoiceContext,
  type OnBehalfInvoiceContext,
} from "./shipment-on-behalf-invoices.ts";
import { soldOnBehalf } from "./sql/on-behalf.ts";
import {
  parcelGetsInvoice,
  UNINVOICED_ORDER_STATUSES,
  UNINVOICED_SHIPMENT_STATUSES,
} from "./sql/uninvoiced.ts";

/**
 * Opens the direct note of each new parcel of a supplier whose ERP issues its notes: parcels
 * created since the supplier turned it on, still going ahead, without a note yet and not sold in
 * venda à ordem (those get their own notes). Returns how many.
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
      ),
    )
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .leftJoin(shipmentInvoices, eq(shipmentInvoices.shipmentId, orderShipments.id))
    .where(
      and(
        isNull(shipmentInvoices.id),
        parcelGetsInvoice({
          invoiceEnabledAt: supplierErpConnections.invoiceEnabledAt,
          parcelCreatedAt: orderShipments.createdAt,
          parcelStatus: orderShipments.status,
          orderStatus: orders.status,
        }),
        sql`not ${soldOnBehalf}`,
      ),
    );
  if (candidates.length === 0) {
    return 0;
  }
  const inserted = await database
    .insert(shipmentInvoices)
    .values(candidates.map((candidate) => ({ ...candidate, kind: "direct" as const })))
    .onConflictDoNothing({ target: [shipmentInvoices.shipmentId, shipmentInvoices.kind] })
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
  readonly kind: InvoiceKind;
  readonly status: InvoiceStatus;
  readonly attempts: number;
  readonly erpContactId: number | null;
  readonly erpOrderId: number | null;
  readonly erpInvoiceId: number | null;
  readonly erpDraftRequestedAt: Date | null;
  readonly createdAt: Date;
  readonly erpConnectedAt: Date | null;
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
  /** What a venda à ordem note builds on; null for a direct note. */
  readonly onBehalf: OnBehalfInvoiceContext | null;
}

async function invoiceHeader(database: Database, invoiceId: string) {
  const [row] = await database
    .select({
      invoice: shipmentInvoices,
      tenantId: orderShipments.tenantId,
      fiscalProfile: suppliers.fiscalProfile,
      address: orderShipments.address,
      items: orderShipments.items,
      shipmentStatus: orderShipments.status,
      orderStatus: orders.status,
      erpStatus: supplierErpConnections.status,
      erpConnectedAt: supplierErpConnections.connectedAt,
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

/** The parcel's items as note lines; an item without its order line is left out. */
export async function parcelInvoiceLines(
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
  const lines = await parcelInvoiceLines(database, header.orderId, header.items);
  const onBehalf =
    invoice.kind === "direct"
      ? null
      : await loadOnBehalfInvoiceContext(database, {
          shipmentId: invoice.shipmentId,
          tenantId: header.tenantId,
          supplierId: invoice.supplierId,
        });
  return {
    id: invoice.id,
    kind: invoice.kind,
    status: invoice.status,
    attempts: invoice.attempts,
    erpContactId: invoice.erpContactId,
    erpOrderId: invoice.erpOrderId,
    erpInvoiceId: invoice.erpInvoiceId,
    erpDraftRequestedAt: invoice.erpDraftRequestedAt,
    createdAt: invoice.createdAt,
    erpConnectedAt: header.erpConnectedAt,
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
    onBehalf,
  };
}

/** The ERP ids a step produced; a later retry goes on from there. */
export async function recordShipmentInvoiceProgress(
  database: Database,
  invoiceId: string,
  progress: {
    erpContactId?: number;
    erpOrderId?: number;
    erpInvoiceId?: number;
    erpDraftRequestedAt?: Date | null;
  },
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

/**
 * Tells the reseller's workspace the parcel's note is out; the e-mail carries its XML and DANFE.
 * Only the note in the box: the screens show the sale to the reseller on its own.
 */
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
    .where(
      and(
        eq(shipmentInvoices.id, input.invoiceId),
        inArray(shipmentInvoices.kind, [...BOX_INVOICE_KINDS]),
      ),
    );
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

/** Tells the supplier's people a note stopped; the reseller's own stock has no one to tell. */
async function queueInvoiceAttentionNotice(
  transaction: DatabaseExecutor,
  input: { invoiceId: string; stoppedSince: Date },
): Promise<void> {
  const [parcel] = await transaction
    .select({
      organizationId: suppliers.organizationId,
      catalogKind: suppliers.catalogKind,
      externalOrderId: orders.externalOrderId,
    })
    .from(shipmentInvoices)
    .innerJoin(orderShipments, eq(orderShipments.id, shipmentInvoices.shipmentId))
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .innerJoin(suppliers, eq(suppliers.id, shipmentInvoices.supplierId))
    .where(eq(shipmentInvoices.id, input.invoiceId));
  if (parcel === undefined || parcel.organizationId === null || parcel.catalogKind !== "supplier") {
    return;
  }
  await notifyWorkspace(transaction, {
    tenantId: parcel.organizationId,
    event: "invoice_attention",
    dedupeKey: `invoice_attention:${input.invoiceId}:${input.stoppedSince.toISOString()}`,
    content: invoiceAttentionContent({ externalOrderId: parcel.externalOrderId }),
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

/**
 * Stopped until the supplier acts; `problem` says what to do, in their words. The supplier's
 * people get an e-mail the moment it stops, unless `tellSupplier` is false (nothing to fix).
 */
export async function markShipmentInvoiceAttention(
  database: Database,
  input: { invoiceId: string; problem: string; tellSupplier?: boolean },
): Promise<void> {
  await database.transaction(async (transaction) => {
    const [before] = await transaction
      .select({ status: shipmentInvoices.status, updatedAt: shipmentInvoices.updatedAt })
      .from(shipmentInvoices)
      .where(eq(shipmentInvoices.id, input.invoiceId))
      .for("update");
    if (before === undefined) {
      return;
    }
    await transaction
      .update(shipmentInvoices)
      .set({ status: "attention", problem: input.problem })
      .where(eq(shipmentInvoices.id, input.invoiceId));
    if (before.status === "attention" || input.tellSupplier === false) {
      return;
    }
    // Keyed by the moment it stopped: a note stopped again after a retry is news again.
    await queueInvoiceAttentionNotice(transaction, {
      invoiceId: input.invoiceId,
      stoppedSince: before.updatedAt,
    });
  });
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

/** A note of one of the supplier's parcels (the one in the box by default), as the order screen shows it; null when none. */
export async function findSupplierShipmentInvoice(
  database: Database,
  input: { supplierId: string; shipmentId: string },
  note: ParcelNote = "box",
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
        inArray(shipmentInvoices.kind, [...parcelNoteKinds(note)]),
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

/** A parcel's note in the box, as the reseller's order page shows it; its problem stays out. */
export interface ResellerShipmentInvoice {
  readonly status: InvoiceStatus;
  readonly number: string | null;
  readonly series: string | null;
  readonly accessKey: string | null;
  readonly authorizedAt: Date | null;
  readonly updatedAt: Date;
}

/**
 * The notes of these parcels, by parcel, from the moment the supplier's ERP starts one: the
 * reseller sees it coming, stopped or issued. Parcels without one are left out.
 */
export async function resellerShipmentInvoices(
  database: Database,
  shipmentIds: readonly string[],
  note: ParcelNote = "box",
): Promise<Map<string, ResellerShipmentInvoice>> {
  if (shipmentIds.length === 0) {
    return new Map();
  }
  const rows = await database
    .select({
      shipmentId: shipmentInvoices.shipmentId,
      status: shipmentInvoices.status,
      number: shipmentInvoices.number,
      series: shipmentInvoices.series,
      accessKey: shipmentInvoices.accessKey,
      authorizedAt: shipmentInvoices.authorizedAt,
      updatedAt: shipmentInvoices.updatedAt,
    })
    .from(shipmentInvoices)
    .where(
      and(
        inArray(shipmentInvoices.shipmentId, [...shipmentIds]),
        inArray(shipmentInvoices.kind, [...parcelNoteKinds(note)]),
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

/** The parcel's authorized note (the one in the box by default), with its access key; null while it has none. */
export async function findShipmentInvoiceFiles(
  database: Database,
  shipmentId: string,
  note: ParcelNote = "box",
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
      and(
        eq(shipmentInvoices.shipmentId, shipmentId),
        eq(shipmentInvoices.status, "authorized"),
        inArray(shipmentInvoices.kind, [...parcelNoteKinds(note)]),
      ),
    );
  if (row === undefined || row.accessKey === null) {
    return null;
  }
  return { ...row, accessKey: row.accessKey };
}
