import {
  lateSinceFor,
  shipmentDeadlines,
  shipmentDelay,
  type ShipmentDeadlines,
  type ShipmentDelay,
  type ShipmentTiming,
} from "@sellbridge/shared/shipment-delay";
import { brazilNationalHolidaysBetween } from "@sellbridge/shared/business-calendar";
import { preparationHoldFrom, type PreparationHold } from "@sellbridge/shared/receiving-rules";
import type { FulfillmentStatus } from "@sellbridge/shared/schemas";
import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { Database, DatabaseExecutor } from "../client.ts";
import {
  orders,
  orderShipments,
  platformSettings,
  shipmentPayments,
  storeConnections,
  suppliers,
} from "../schema/index.ts";
import { receivingAccountApproved } from "./sql/sellable.ts";

/** When the parcel was first marked shipped (the history keeps every step). */
export const firstShippedAt = sql<Date | null>`(
  select min(shipped.created_at) from shipment_events shipped
  where shipped.shipment_id = ${orderShipments.id} and shipped.status = 'shipped'
)`.mapWith((value: string | null) => (value === null ? null : new Date(value)));

/**
 * The latest forward to the supplier: a re-forward of a cancelled parcel starts it over. A note
 * written while the parcel waits keeps the status, so it is also a `forwarded` event; only one
 * that opens a round counts (the first event, or one right after another status), else every
 * note would restart the supplier's accept and dispatch times.
 */
export const latestForwardedAt = sql<Date | null>`(
  select max(forwarded.created_at) from shipment_events forwarded
  where forwarded.shipment_id = ${orderShipments.id} and forwarded.status = 'forwarded'
    and coalesce((
      select previous.status from shipment_events previous
      where previous.shipment_id = forwarded.shipment_id
        and previous.created_at < forwarded.created_at
      order by previous.created_at desc
      limit 1
    ), '') <> 'forwarded'
)`.mapWith((value: string | null) => (value === null ? null : new Date(value)));

/**
 * An admin rule switched on before this public supplier's parcel was created; parcels forwarded
 * earlier keep moving as they did. Needs `order_shipments` and `suppliers` in the FROM clause.
 */
function ruleCoversParcel(
  since:
    | typeof platformSettings.requireReceivingAccountSince
    | typeof platformSettings.paymentBeforePreparingSince,
): SQL<boolean> {
  return sql<boolean>`coalesce(${suppliers.catalogKind} = 'supplier' and (
    select ${since} from ${platformSettings} where ${platformSettings.id} = 1
  ) <= ${orderShipments.createdAt}, false)`;
}

/** When the reseller's payment of the parcel was approved; null while unpaid or being refunded. */
const parcelPaidAt = sql`(
  select ${shipmentPayments.paidAt} from ${shipmentPayments}
  where ${shipmentPayments.shipmentId} = ${orderShipments.id}
    and ${shipmentPayments.status} = 'approved'
    and ${shipmentPayments.refundRequestedAt} is null
)`;

const STILL_WITH_SUPPLIER = sql.raw("'forwarded', 'accepted', 'picking', 'ready'");

/**
 * Why the supplier may not prepare the parcel yet (`shared/domain/receiving-rules.ts`): no approved
 * receiving account while the admin requires one, or not paid while the admin requires payment
 * first. Null once the parcel left the supplier. Needs `order_shipments` and `suppliers`.
 */
export const preparationHold = sql<PreparationHold | null>`(case
  when ${orderShipments.status} not in (${STILL_WITH_SUPPLIER}) then null
  when ${ruleCoversParcel(platformSettings.requireReceivingAccountSince)}
    and not ${receivingAccountApproved()} then 'receiving_account'
  when ${ruleCoversParcel(platformSettings.paymentBeforePreparingSince)}
    and ${parcelPaidAt} is null then 'payment'
end)`.mapWith((value: string | null) => preparationHoldFrom(value));

/**
 * When the supplier's accept and dispatch times start: the latest forward, or the payment when
 * the admin requires payment first (null while unpaid, so nothing is due or late meanwhile).
 */
export const supplierClockStartedAt = sql<Date | null>`(case
  when ${ruleCoversParcel(platformSettings.paymentBeforePreparingSince)} then (
    case when ${parcelPaidAt} is null then null else greatest(${parcelPaidAt}, ${latestForwardedAt}) end
  )
  else ${latestForwardedAt}
end)`.mapWith((value: string | null) => (value === null ? null : new Date(value)));

const HOLIDAY_YEARS_BEHIND = 1;
const HOLIDAY_YEARS_AHEAD = 3;
/** The longest real run of days off is a few days (Carnaval); the search stops well after it. */
const POSTING_DAY_SEARCH_DAYS = 15;

/**
 * The national holidays the posting day skips, from last year to three years ahead of when the
 * server started: a constant list (no user input), so it is inlined in the SQL.
 */
function holidaysSql(): SQL {
  const year = new Date().getUTCFullYear();
  const holidays = brazilNationalHolidaysBetween(
    year - HOLIDAY_YEARS_BEHIND,
    year + HOLIDAY_YEARS_AHEAD,
  );
  return sql.raw(`'{${holidays.join(",")}}'::date[]`);
}

/**
 * The cutoff (minutes after midnight in Brasília) of the parcel's marketplace while the admin's
 * cutoff rule covers it: switched on before the parcel was created. Null otherwise.
 */
const parcelCutoffMinutes = sql<number | null>`(
  select case ${storeConnections.marketplace}
    when 'mercado_livre' then ${platformSettings.mercadoLivreCutoffMinutes}
    when 'shopee' then ${platformSettings.shopeeCutoffMinutes}
    when 'tiktok_shop' then ${platformSettings.tiktokShopCutoffMinutes}
  end
  from ${orders}
  join ${storeConnections} on ${storeConnections.id} = ${orders.storeConnectionId}
  cross join ${platformSettings}
  where ${orders.id} = ${orderShipments.orderId}
    and ${platformSettings.id} = 1
    and ${platformSettings.dispatchCutoffSince} <= ${orderShipments.createdAt}
)`;

/**
 * The posting day from the marketplace's cutoff (`shared/domain/dispatch-cutoff.ts`, whose
 * `cutoffPostingDay` this mirrors; a repository test checks they agree): the first business day
 * from the day the supplier's clock started, or from the next day when it started at or after
 * the cutoff. Dated at midnight in Brasília, as Mercado Livre dates its own. Null for a parcel the
 * rule does not cover, the team's own suppliers and Mercado Livre Full, which the supplier does
 * not post.
 */
const cutoffPostingDate = sql`(case
  when ${suppliers.catalogKind} = 'supplier'
    and coalesce(${orderShipments.marketplaceLogisticType}, '') <> 'fulfillment'
  then (
    select min(candidate.day) at time zone 'America/Sao_Paulo'
    from (select ${supplierClockStartedAt} as started_at, ${parcelCutoffMinutes} as cutoff) as parcel_clock
    cross join lateral (
      select (parcel_clock.started_at at time zone 'America/Sao_Paulo') as local_start
    ) as local_clock
    cross join lateral generate_series(
      (local_clock.local_start::date + case
        when local_clock.local_start::time < make_time(parcel_clock.cutoff / 60, parcel_clock.cutoff % 60, 0)
        then 0 else 1 end)::timestamp,
      (local_clock.local_start::date + ${sql.raw(String(POSTING_DAY_SEARCH_DAYS))})::timestamp,
      interval '1 day'
    ) as candidate(day)
    where parcel_clock.cutoff is not null
      and extract(isodow from candidate.day) < 6
      and candidate.day::date <> all(${holidaysSql()})
  )
end)`;

/**
 * The date the parcel must be posted by: the marketplace's when it sent one, else the one from
 * the marketplace's cutoff while that rule is on. Needs `order_shipments` and `suppliers`.
 */
export const effectiveDispatchDeadlineAt = sql<Date | null>`coalesce(
  ${orderShipments.dispatchDeadlineAt}, ${cutoffPostingDate}
)`.mapWith((value: string | null) => (value === null ? null : new Date(value)));

/** Brazil keeps a fixed -03:00 offset (no daylight saving since 2019), as `period-range` does. */
const BRAZIL_OFFSET = sql.raw("interval '3 hours'");

/** The end of the Brazil calendar day of a timestamp: the instant `overdueSince` returns. */
export function endOfBrazilDay(column: SQL): SQL<Date | null> {
  return sql<Date | null>`((date_trunc('day', (${column} at time zone 'UTC') - ${BRAZIL_OFFSET}) + interval '1 day' + ${BRAZIL_OFFSET}) at time zone 'UTC')`;
}

/** Why one parcel waits before the supplier may prepare it, read inside the caller's transaction. */
export async function findPreparationHold(
  executor: DatabaseExecutor,
  shipmentId: string,
): Promise<PreparationHold | null> {
  const [row] = await executor
    .select({ hold: preparationHold })
    .from(orderShipments)
    .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
    .where(eq(orderShipments.id, shipmentId));
  return row?.hold ?? null;
}

/** The supplier's side of the timing: when its times start and its own hours. */
export const supplierTimingColumns = {
  forwardedAt: supplierClockStartedAt,
  acceptWithinHours: sql<
    number | null
  >`case when ${suppliers.catalogKind} = 'supplier' then ${suppliers.acceptWithinHours} else null end`.mapWith(
    Number,
  ),
  dispatchWithinHours: sql<
    number | null
  >`case when ${suppliers.catalogKind} = 'supplier' then ${suppliers.dispatchWithinHours} else null end`.mapWith(
    Number,
  ),
};

/** By when the supplier must accept and dispatch a parcel read with `supplierTimingColumns`. */
export function supplierDeadlines(
  shipment: Pick<ShipmentTiming, "status" | "dispatchDeadlineAt" | "estimatedDeliveryAt">,
  supplier: Pick<ShipmentTiming, "forwardedAt" | "acceptWithinHours" | "dispatchWithinHours">,
): ShipmentDeadlines {
  return shipmentDeadlines({ ...shipment, ...supplier, shippedAt: null });
}

/** The columns `shipmentDelay` reads, for a select on order_shipments joined to suppliers. */
export const shipmentTimingColumns = {
  status: orderShipments.status,
  dispatchDeadlineAt: effectiveDispatchDeadlineAt,
  estimatedDeliveryAt: orderShipments.estimatedDeliveryAt,
  shippedAt: firstShippedAt,
  ...supplierTimingColumns,
};

type TimedShipment = ShipmentTiming;

/**
 * The parcel with what is late about it, if anything, and by when the supplier still has to
 * accept and dispatch it (`shared/domain/shipment-delay.ts`).
 */
export function withShipmentDelay<TShipment extends TimedShipment>(
  shipment: TShipment,
  now: Date,
): TShipment & ShipmentDeadlines & { delay: ShipmentDelay | null } {
  return { ...shipment, ...shipmentDeadlines(shipment), delay: shipmentDelay(shipment, now) };
}

/** A parcel of an order that is late: what is late and whose parcel it is. */
export interface ShipmentLateEvent {
  kind: "shipment_late";
  entityId: string;
  at: Date;
  shipmentId: string;
  externalOrderId: string;
  supplierName: string;
  delay: ShipmentDelay;
}

/**
 * When the parcel became late: the same instant `shipmentDelay` starts calling it late. Dating
 * it at the deadline itself put it before a bell opened during that day, so it never counted
 * as new.
 */
function lateSince(shipment: TimedShipment, delay: ShipmentDelay): Date {
  return lateSinceFor(shipment, delay) ?? new Date(0);
}

/** Parcels still with the supplier or on their way: the only ones that can be late. */
const OPEN_STATUSES: FulfillmentStatus[] = ["forwarded", "accepted", "picking", "ready", "shipped"];

/** Late parcels of the tenant's live orders, oldest delay first, at most `limit`. */
export async function shipmentLateEvents(
  database: Database,
  input: { tenantId: string; limit: number; now: Date },
): Promise<ShipmentLateEvent[]> {
  const rows = await database
    .select({
      shipmentId: orderShipments.id,
      entityId: orders.id,
      externalOrderId: orders.externalOrderId,
      supplierName: suppliers.name,
      ...shipmentTimingColumns,
    })
    .from(orderShipments)
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
    .where(
      and(
        eq(orderShipments.tenantId, input.tenantId),
        eq(orders.tenantId, input.tenantId),
        inArray(orderShipments.status, OPEN_STATUSES),
        inArray(orders.status, ["paid", "shipped"]),
      ),
    )
    .orderBy(asc(orderShipments.createdAt));
  return rows
    .flatMap((row) => {
      const delay = shipmentDelay(row, input.now);
      if (delay === null) {
        return [];
      }
      const event = {
        shipmentId: row.shipmentId,
        entityId: row.entityId,
        externalOrderId: row.externalOrderId,
        supplierName: row.supplierName,
      };
      return [{ ...event, kind: "shipment_late" as const, delay, at: lateSince(row, delay) }];
    })
    .toSorted((left, right) => left.at.getTime() - right.at.getTime())
    .slice(0, input.limit);
}
