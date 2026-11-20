import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import type { AccessKeyParts } from "@sellbridge/shared/nfe-access-key";
import type { ResellerInvoiceSource } from "@sellbridge/shared/reseller-invoice";
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type { Database, DatabaseExecutor } from "../client.ts";
import {
  orders,
  orderShipments,
  resellerErpConnections,
  shipmentInvoices,
  shipmentResellerInvoices,
  storeConnections,
  supplierErpConnections,
  suppliers,
  tenantProfile,
} from "../schema/index.ts";
import { hasDirectInvoice } from "./sql/on-behalf.ts";
import { UNINVOICED_ORDER_STATUSES, UNINVOICED_SHIPMENT_STATUSES } from "./sql/uninvoiced.ts";

/**
 * Opens the reseller's sale note of each new parcel sold in venda à ordem: the supplier issues
 * through its ERP with "Venda à ordem" chosen, and the reseller sells as a company (a CPF reseller
 * stays on the supplier's direct note, decision of 18/11/2026). A parcel that already has a direct
 * note keeps it. Returns how many were opened.
 */
export async function queueResellerSaleInvoices(database: Database): Promise<number> {
  const candidates = await database
    .select({ shipmentId: orderShipments.id, tenantId: orderShipments.tenantId })
    .from(orderShipments)
    .innerJoin(
      suppliers,
      and(
        eq(suppliers.id, orderShipments.supplierId),
        sql`${suppliers.fiscalProfile}->>'invoiceModel' = 'on_behalf'`,
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
    .innerJoin(
      tenantProfile,
      and(eq(tenantProfile.tenantId, orderShipments.tenantId), isNotNull(tenantProfile.cnpj)),
    )
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .leftJoin(shipmentResellerInvoices, eq(shipmentResellerInvoices.shipmentId, orderShipments.id))
    .where(
      and(
        isNull(shipmentResellerInvoices.id),
        notInArray(orderShipments.status, [...UNINVOICED_SHIPMENT_STATUSES]),
        notInArray(orders.status, [...UNINVOICED_ORDER_STATUSES]),
        sql`not ${hasDirectInvoice}`,
      ),
    );
  if (candidates.length === 0) {
    return 0;
  }
  const inserted = await database
    .insert(shipmentResellerInvoices)
    .values(candidates)
    .onConflictDoNothing({ target: shipmentResellerInvoices.shipmentId })
    .returning({ id: shipmentResellerInvoices.id });
  return inserted.length;
}

/** A reseller note still missing, with what reading the marketplace needs. */
export interface DueResellerSaleInvoice {
  readonly id: string;
  readonly shipmentId: string;
  readonly tenantId: string;
  readonly checks: number;
  /**
   * The reseller's own ERP issues this note: it is connected with issuing on since before the
   * parcel was created, and the order is on Mercado Livre (the only channel it sends notes to).
   */
  readonly issuesFromErp: boolean;
  /** How far the ERP got: its ids and when the note was asked for and sent; null before. */
  readonly erpContactId: number | null;
  readonly erpInvoiceId: number | null;
  readonly erpDraftRequestedAt: Date | null;
  readonly erpSentAt: Date | null;
  readonly externalOrderId: string;
  /** Digits; the note must be issued by this CNPJ. Null when the reseller stopped being a company. */
  readonly resellerCnpj: string | null;
  readonly store: {
    readonly id: string;
    readonly marketplace: string;
    readonly externalShopId: string;
    readonly accessTokenEnc: string | null;
  };
}

/** The reseller's ERP account that issues a parcel's note: connected, issuing since before it. */
const ISSUING_CONNECTION = and(
  eq(resellerErpConnections.tenantId, shipmentResellerInvoices.tenantId),
  eq(resellerErpConnections.provider, "bling"),
  eq(resellerErpConnections.status, "connected"),
  isNotNull(resellerErpConnections.saleNotesEnabledAt),
  gte(orderShipments.createdAt, resellerErpConnections.saleNotesEnabledAt),
);

/** Whether that account issues the note: it does only for Mercado Livre orders. */
const ISSUED_BY_ERP = sql<boolean>`${resellerErpConnections.id} is not null and ${storeConnections.marketplace} = 'mercado_livre'`;

const DUE_COLUMNS = {
  id: shipmentResellerInvoices.id,
  shipmentId: shipmentResellerInvoices.shipmentId,
  tenantId: shipmentResellerInvoices.tenantId,
  checks: shipmentResellerInvoices.checks,
  issuesFromErp: ISSUED_BY_ERP,
  erpContactId: shipmentResellerInvoices.erpContactId,
  erpInvoiceId: shipmentResellerInvoices.erpInvoiceId,
  erpDraftRequestedAt: shipmentResellerInvoices.erpDraftRequestedAt,
  erpSentAt: shipmentResellerInvoices.erpSentAt,
  externalOrderId: orders.externalOrderId,
  resellerCnpj: tenantProfile.cnpj,
  store: {
    id: storeConnections.id,
    marketplace: storeConnections.marketplace,
    externalShopId: storeConnections.externalShopId,
    accessTokenEnc: storeConnections.accessTokenEnc,
  },
};

/**
 * Takes up to `limit` missing notes due for a read of the marketplace, for sales still going
 * ahead, and leases them: the next read moves `leaseMilliseconds` ahead, so a crashed run is picked
 * up again, and `SKIP LOCKED` keeps two workers apart.
 */
export async function claimDueResellerSaleInvoices(
  database: Database,
  claim: { now: Date; limit: number; leaseMilliseconds: number },
): Promise<DueResellerSaleInvoice[]> {
  return database.transaction(async (transaction) => {
    const due = await transaction
      .select(DUE_COLUMNS)
      .from(shipmentResellerInvoices)
      .innerJoin(orderShipments, eq(orderShipments.id, shipmentResellerInvoices.shipmentId))
      .innerJoin(orders, eq(orders.id, orderShipments.orderId))
      .innerJoin(storeConnections, eq(storeConnections.id, orders.storeConnectionId))
      .leftJoin(tenantProfile, eq(tenantProfile.tenantId, shipmentResellerInvoices.tenantId))
      .leftJoin(resellerErpConnections, ISSUING_CONNECTION)
      .where(
        and(
          isNull(shipmentResellerInvoices.accessKey),
          isNull(shipmentResellerInvoices.erpStoppedAt),
          lte(
            shipmentResellerInvoices.nextCheckAt,
            sql`greatest(${claim.now.toISOString()}::timestamptz, now())`,
          ),
          notInArray(orderShipments.status, [...UNINVOICED_SHIPMENT_STATUSES]),
          notInArray(orders.status, [...UNINVOICED_ORDER_STATUSES]),
        ),
      )
      .orderBy(asc(shipmentResellerInvoices.nextCheckAt))
      .limit(claim.limit)
      .for("update", { of: shipmentResellerInvoices, skipLocked: true });
    if (due.length === 0) {
      return [];
    }
    await transaction
      .update(shipmentResellerInvoices)
      .set({ nextCheckAt: new Date(claim.now.getTime() + claim.leaseMilliseconds) })
      .where(
        inArray(
          shipmentResellerInvoices.id,
          due.map((row) => row.id),
        ),
      );
    return due;
  });
}

/** What a found note keeps: its key and the parts the key carries. */
function foundValues(parts: AccessKeyParts, foundAt: Date) {
  return {
    accessKey: parts.accessKey,
    number: parts.number,
    series: parts.series,
    foundAt,
    problem: null,
  };
}

/** Saves the note read on the marketplace's order; one already found is left as it was. */
export async function recordMarketplaceResellerSaleInvoice(
  database: Database,
  found: { invoiceId: string; parts: AccessKeyParts; issuedAt: Date | null; now: Date },
): Promise<void> {
  await database
    .update(shipmentResellerInvoices)
    .set({
      ...foundValues(found.parts, found.now),
      issuedAt: found.issuedAt,
      source: "marketplace",
    })
    .where(
      and(
        eq(shipmentResellerInvoices.id, found.invoiceId),
        isNull(shipmentResellerInvoices.accessKey),
      ),
    );
}

/**
 * The marketplace had no usable note this time: read again at `nextCheckAt`. `problem` says why
 * the note there does not serve (another CNPJ, for one), or is null when there was none.
 */
export async function scheduleResellerSaleInvoiceCheck(
  database: Database,
  next: { invoiceId: string; checks: number; nextCheckAt: Date; problem: string | null },
): Promise<void> {
  await database
    .update(shipmentResellerInvoices)
    .set({ checks: next.checks, nextCheckAt: next.nextCheckAt, problem: next.problem })
    .where(
      and(
        eq(shipmentResellerInvoices.id, next.invoiceId),
        isNull(shipmentResellerInvoices.accessKey),
      ),
    );
}

const REMESSA_STARTED =
  "A remessa do fornecedor já cita a nota registrada neste pedido. Para trocar a nota, fale com o suporte do SellBridge.";

/**
 * The supplier's remessa was not asked of its ERP yet: until then it cites no note, and the
 * reseller may still replace a wrong one.
 */
function remessaNotStartedSql(shipmentId: string) {
  return sql`not exists (select 1 from ${shipmentInvoices} where ${shipmentInvoices.shipmentId} = ${shipmentId} and ${shipmentInvoices.kind} = 'on_behalf_shipment' and (${shipmentInvoices.erpInvoiceId} is not null or ${shipmentInvoices.erpDraftRequestedAt} is not null))`;
}

/** Whether the supplier's remessa of the parcel was asked of its ERP: it then cites the note. */
async function remessaStarted(executor: DatabaseExecutor, shipmentId: string): Promise<boolean> {
  const [row] = await executor
    .select({ id: shipmentInvoices.id })
    .from(shipmentInvoices)
    .where(
      and(
        eq(shipmentInvoices.shipmentId, shipmentId),
        eq(shipmentInvoices.kind, "on_behalf_shipment"),
        or(
          isNotNull(shipmentInvoices.erpInvoiceId),
          isNotNull(shipmentInvoices.erpDraftRequestedAt),
        ),
      ),
    );
  return row !== undefined;
}

/**
 * Saves the reseller's note of its parcel with `source`: on a parcel still waiting, over the same
 * note (its XML after its typed key), or over another note while the supplier's remessa has not
 * started. Holds the note's row meanwhile, as the remessa's start does (see
 * `claimOnBehalfRemessaDraft`). The same note already saved is left as it is, but for a typed key
 * whose XML now reached the marketplace.
 */
async function saveResellerSaleInvoiceOf(
  database: Database,
  note: {
    tenantId: string;
    shipmentId: string;
    parts: AccessKeyParts;
    now: Date;
    source: "typed" | "uploaded";
  },
): Promise<void> {
  await database.transaction(async (transaction) => {
    const [existing] = await transaction
      .select({
        id: shipmentResellerInvoices.id,
        accessKey: shipmentResellerInvoices.accessKey,
        source: shipmentResellerInvoices.source,
      })
      .from(shipmentResellerInvoices)
      .where(
        and(
          eq(shipmentResellerInvoices.shipmentId, note.shipmentId),
          eq(shipmentResellerInvoices.tenantId, note.tenantId),
        ),
      )
      .for("update");
    if (existing === undefined) {
      throw notFoundError("Este pedido não espera a sua nota de venda");
    }
    const sameNote = existing.accessKey === note.parts.accessKey;
    // The same note stays as it is, except a typed key whose XML now reached the marketplace.
    if (sameNote && (note.source === "typed" || existing.source !== "typed")) {
      return;
    }
    const replacing = existing.accessKey !== null && !sameNote;
    if (replacing && (await remessaStarted(transaction, note.shipmentId))) {
      throw conflictError(REMESSA_STARTED);
    }
    await transaction
      .update(shipmentResellerInvoices)
      .set({ ...foundValues(note.parts, note.now), issuedAt: null, source: note.source })
      .where(eq(shipmentResellerInvoices.id, existing.id));
  });
}
/**
 * Saves the key the reseller typed for its own parcel; it replaces a wrong one while the
 * supplier's remessa has not started.
 *
 * @throws {AppError} NOT_FOUND when the parcel is not the reseller's or waits for no note;
 * CONFLICT when another note is saved and the remessa already cites it.
 */
export async function saveTypedResellerSaleInvoice(
  database: Database,
  typed: { tenantId: string; shipmentId: string; parts: AccessKeyParts; now: Date },
): Promise<void> {
  await saveResellerSaleInvoiceOf(database, { ...typed, source: "typed" });
}

/**
 * Saves the reseller's note whose XML it uploaded (and SellBridge sent to the marketplace): on a
 * parcel still waiting, over the same note, or over another one while the supplier's remessa has
 * not started.
 *
 * @throws {AppError} NOT_FOUND when the parcel is not the reseller's or waits for no note;
 * CONFLICT when another note is saved and the remessa already cites it.
 */
export async function saveUploadedResellerSaleInvoice(
  database: Database,
  uploaded: { tenantId: string; shipmentId: string; parts: AccessKeyParts; now: Date },
): Promise<void> {
  await saveResellerSaleInvoiceOf(database, { ...uploaded, source: "uploaded" });
}

/**
 * Whether the reseller may still put another note on its parcel: no note yet, or the supplier's
 * remessa has not started. Read before the note is sent anywhere.
 */
export async function canReplaceResellerSaleInvoice(
  database: Database,
  input: { tenantId: string; shipmentId: string },
): Promise<boolean> {
  const [row] = await database
    .select({ id: shipmentResellerInvoices.id })
    .from(shipmentResellerInvoices)
    .where(
      and(
        eq(shipmentResellerInvoices.shipmentId, input.shipmentId),
        eq(shipmentResellerInvoices.tenantId, input.tenantId),
        or(isNull(shipmentResellerInvoices.accessKey), remessaNotStartedSql(input.shipmentId)),
      ),
    );
  return row !== undefined;
}

/** The reseller's sale note of a parcel, as the order screens show it. */
export interface ResellerSaleInvoice {
  readonly accessKey: string | null;
  readonly number: string | null;
  readonly series: string | null;
  readonly source: ResellerInvoiceSource | null;
  readonly foundAt: Date | null;
  readonly problem: string | null;
  /** The reseller's own Bling issues it (turned on before the parcel, on Mercado Livre). */
  readonly issuedByErp: boolean;
  /** The Bling stopped on it: `problem` says why, and it waits for the reseller to retry. */
  readonly erpStopped: boolean;
}

/** The reseller notes of the tenant's parcels, by parcel id; parcels without one are absent. */
export async function resellerSaleInvoicesOf(
  database: Database,
  tenantId: string,
  shipmentIds: readonly string[],
): Promise<Map<string, ResellerSaleInvoice>> {
  if (shipmentIds.length === 0) {
    return new Map();
  }
  const rows = await database
    .select({
      shipmentId: shipmentResellerInvoices.shipmentId,
      accessKey: shipmentResellerInvoices.accessKey,
      number: shipmentResellerInvoices.number,
      series: shipmentResellerInvoices.series,
      source: shipmentResellerInvoices.source,
      foundAt: shipmentResellerInvoices.foundAt,
      problem: shipmentResellerInvoices.problem,
      issuedByErp: ISSUED_BY_ERP,
      erpStopped: sql<boolean>`${shipmentResellerInvoices.erpStoppedAt} is not null`,
    })
    .from(shipmentResellerInvoices)
    .innerJoin(orderShipments, eq(orderShipments.id, shipmentResellerInvoices.shipmentId))
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .innerJoin(storeConnections, eq(storeConnections.id, orders.storeConnectionId))
    .leftJoin(resellerErpConnections, ISSUING_CONNECTION)
    .where(
      and(
        eq(shipmentResellerInvoices.tenantId, tenantId),
        inArray(shipmentResellerInvoices.shipmentId, [...shipmentIds]),
      ),
    );
  return new Map(rows.map(({ shipmentId, ...invoice }) => [shipmentId, invoice]));
}

/** How far the reseller's ERP got with the note; each id is saved as soon as it comes. */
export async function recordResellerSaleIssueProgress(
  database: Database,
  invoiceId: string,
  progress: {
    erpContactId?: number;
    erpInvoiceId?: number;
    erpDraftRequestedAt?: Date | null;
    erpSentAt?: Date;
  },
): Promise<void> {
  await database
    .update(shipmentResellerInvoices)
    .set(progress)
    .where(
      and(eq(shipmentResellerInvoices.id, invoiceId), isNull(shipmentResellerInvoices.accessKey)),
    );
}

/** The reseller's ERP could not issue the note: it waits, with `problem`, for the reseller. */
export async function stopResellerSaleIssue(
  database: Database,
  stop: { invoiceId: string; problem: string; now: Date },
): Promise<void> {
  await database
    .update(shipmentResellerInvoices)
    .set({ erpStoppedAt: stop.now, problem: stop.problem })
    .where(
      and(
        eq(shipmentResellerInvoices.id, stop.invoiceId),
        isNull(shipmentResellerInvoices.accessKey),
      ),
    );
}

/**
 * Puts a stopped note of the reseller's parcel back in line for its ERP.
 *
 * @throws {AppError} NOT_FOUND when the parcel is not the reseller's or its note is not stopped.
 */
export async function retryResellerSaleIssue(
  database: Database,
  retry: { tenantId: string; shipmentId: string; now: Date },
): Promise<void> {
  const updated = await database
    .update(shipmentResellerInvoices)
    .set({ erpStoppedAt: null, problem: null, nextCheckAt: retry.now })
    .where(
      and(
        eq(shipmentResellerInvoices.tenantId, retry.tenantId),
        eq(shipmentResellerInvoices.shipmentId, retry.shipmentId),
        isNull(shipmentResellerInvoices.accessKey),
        isNotNull(shipmentResellerInvoices.erpStoppedAt),
      ),
    )
    .returning({ id: shipmentResellerInvoices.id });
  if (updated.length === 0) {
    throw notFoundError("Esta nota não está parada");
  }
}

/** Saves the note the reseller's ERP issued and Mercado Livre got; one already found stays. */
export async function recordErpResellerSaleInvoice(
  database: Database,
  found: { invoiceId: string; parts: AccessKeyParts; now: Date },
): Promise<void> {
  await database
    .update(shipmentResellerInvoices)
    .set({ ...foundValues(found.parts, found.now), issuedAt: found.now, source: "bling" })
    .where(
      and(
        eq(shipmentResellerInvoices.id, found.invoiceId),
        isNull(shipmentResellerInvoices.accessKey),
      ),
    );
}
