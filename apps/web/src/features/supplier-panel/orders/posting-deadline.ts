import type { FulfillmentStatus } from "@sellbridge/shared/schemas";
import { overdueSince } from "@sellbridge/shared/shipment-delay";
import { isOrderBlocked, isSupplierQueueStatus } from "@sellbridge/shared/supplier-panel-orders";
import { LABEL_MARKETPLACE } from "@sellbridge/shared/supplier-order-labels";
import { brazilDayKey, formatDeadlineDay } from "@/lib/relative-time";

export type PostingDeadlineState = "on_time" | "today" | "late";

/** Mercado Livre's date for the parcel to reach the carrier, as the supplier reads it. */
export interface PostingDeadline {
  state: PostingDeadlineState;
  label: string;
}

export interface PostingDeadlineParcel {
  marketplace: string;
  status: FulfillmentStatus;
  orderStatus: string;
  dispatchDeadlineAt: Date | null;
}

/**
 * The marketplace's posting date while the parcel is still with the supplier; null once it left,
 * for a sale not released for shipping, and when Mercado Livre gave no date. The date holds for
 * its whole day, as the queue's countdown counts it (`overdueSince`).
 */
export function postingDeadline(parcel: PostingDeadlineParcel, now: Date): PostingDeadline | null {
  const date = parcel.dispatchDeadlineAt;
  if (
    date === null ||
    parcel.marketplace !== LABEL_MARKETPLACE ||
    !isSupplierQueueStatus(parcel.status) ||
    isOrderBlocked(parcel.orderStatus)
  ) {
    return null;
  }
  const day = formatDeadlineDay(date, now);
  if (overdueSince(date).getTime() <= now.getTime()) {
    return { state: "late", label: `Postagem atrasada (prazo: ${day})` };
  }
  if (brazilDayKey(date) === brazilDayKey(now)) {
    return { state: "today", label: "Postar no Mercado Livre hoje" };
  }
  return { state: "on_time", label: `Postar no Mercado Livre até ${day}` };
}
