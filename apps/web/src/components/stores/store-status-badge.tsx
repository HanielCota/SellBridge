import { STORE_STATUS_LABELS, type StoreStatus } from "@sellbridge/shared/schemas";
import { type StatusTone, ToneStatus } from "@/components/data/tone-status";

const STORE_TONES: Record<StoreStatus, StatusTone> = {
  connected: "success",
  expired: "warning",
  error: "danger",
  disconnected: "muted",
};

export function StoreStatusBadge({ status }: { status: StoreStatus }) {
  return <ToneStatus tone={STORE_TONES[status]} label={STORE_STATUS_LABELS[status]} />;
}
