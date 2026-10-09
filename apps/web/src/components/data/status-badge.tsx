import {
  LISTING_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  orderStatusSchema,
  STORE_STATUS_LABELS,
  type ListingStatus,
  type OrderStatus,
  type StoreStatus,
} from "@sellbridge/shared/schemas";
import { type StatusTone, ToneStatus } from "./tone-status";

const STORE_TONES: Record<StoreStatus, StatusTone> = {
  connected: "success",
  expired: "warning",
  error: "danger",
  disconnected: "muted",
};

const LISTING_TONES: Record<ListingStatus, StatusTone> = {
  pending: "info",
  publishing: "info",
  published: "success",
  error: "danger",
};

export function StoreStatusBadge({ status }: { status: StoreStatus }) {
  return <ToneStatus tone={STORE_TONES[status]} label={STORE_STATUS_LABELS[status]} />;
}

export function ListingStatusBadge({ status }: { status: ListingStatus }) {
  return <ToneStatus tone={LISTING_TONES[status]} label={LISTING_STATUS_LABELS[status]} />;
}

const ORDER_TONES: Record<OrderStatus, StatusTone> = {
  pending: "warning",
  paid: "info",
  shipped: "info",
  delivered: "success",
  cancelled: "muted",
  returned: "danger",
};

/** Accepts the raw status string from the database; unknown values show as-is in gray. */
export function OrderStatusBadge({ status }: { status: string }) {
  const parsed = orderStatusSchema.safeParse(status);
  if (!parsed.success) {
    return <ToneStatus tone="muted" label={status} />;
  }
  return <ToneStatus tone={ORDER_TONES[parsed.data]} label={ORDER_STATUS_LABELS[parsed.data]} />;
}
