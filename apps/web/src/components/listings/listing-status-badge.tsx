import { LISTING_STATUS_LABELS, type ListingStatus } from "@sellbridge/shared/schemas";
import { type StatusTone, ToneStatus } from "@/components/data/tone-status";

const LISTING_TONES: Record<ListingStatus, StatusTone> = {
  pending: "info",
  publishing: "info",
  published: "success",
  paused: "muted",
  error: "danger",
};

export function ListingStatusBadge({ status }: { status: ListingStatus }) {
  return <ToneStatus tone={LISTING_TONES[status]} label={LISTING_STATUS_LABELS[status]} />;
}
