import type { FulfillmentStatus } from "@sellbridge/shared/schemas";
import { overdueSince } from "@sellbridge/shared/shipment-delay";
import { isOrderBlocked, isSupplierQueueStatus } from "@sellbridge/shared/supplier-panel-orders";
import { brazilDayKey, formatDeadlineDay } from "@/lib/relative-time";

/** "no Mercado Livre", "na Shopee": where the parcel is posted, with the channel's article. */
const POSTING_CHANNELS: Readonly<Record<string, string>> = {
  mercado_livre: "no Mercado Livre",
  shopee: "na Shopee",
  tiktok_shop: "no TikTok Shop",
};

export type PostingDeadlineState = "on_time" | "today" | "late";

/** The day the parcel must reach the carrier, as the supplier reads it. */
export interface PostingDeadline {
  state: PostingDeadlineState;
  label: string;
}

export interface PostingDeadlineParcel {
  marketplace: string;
  status: FulfillmentStatus;
  orderStatus: string;
  /** The marketplace's posting date, or the one from its cutoff time while that rule is on. */
  dispatchDeadlineAt: Date | null;
}

function postVerb(marketplace: string): string {
  const channel = POSTING_CHANNELS[marketplace];
  return channel === undefined ? "Postar" : `Postar ${channel}`;
}

/**
 * The posting date while the parcel is still with the supplier; null once it left, for a sale
 * not released for shipping, and when there is no date. The date holds for its whole day, as
 * the queue's countdown counts it (`overdueSince`).
 */
export function postingDeadline(parcel: PostingDeadlineParcel, now: Date): PostingDeadline | null {
  const date = parcel.dispatchDeadlineAt;
  if (
    date === null ||
    !isSupplierQueueStatus(parcel.status) ||
    isOrderBlocked(parcel.orderStatus)
  ) {
    return null;
  }
  const day = formatDeadlineDay(date, now);
  const verb = postVerb(parcel.marketplace);
  if (overdueSince(date).getTime() <= now.getTime()) {
    return { state: "late", label: `Postagem atrasada (prazo: ${day})` };
  }
  if (brazilDayKey(date) === brazilDayKey(now)) {
    return { state: "today", label: `${verb} hoje` };
  }
  return { state: "on_time", label: `${verb} até ${day}` };
}
