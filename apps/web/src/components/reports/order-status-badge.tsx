import {
  ORDER_STATUS_LABELS,
  orderStatusSchema,
  type OrderStatus,
} from "@sellbridge/shared/schemas";
import { type StatusTone, ToneStatus } from "@/components/data/tone-status";

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
