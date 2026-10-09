import {
  LISTING_STATUS_LABELS,
  STORE_STATUS_LABELS,
  type ListingStatus,
  type StoreStatus,
} from "@sellbridge/shared/schemas";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "info" | "muted";

const TONE_CLASSES: Record<Tone, string> = {
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  danger: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
  info: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  muted: "border-border bg-muted text-muted-foreground",
};

const STORE_TONES: Record<StoreStatus, Tone> = {
  connected: "success",
  expired: "warning",
  error: "danger",
  disconnected: "muted",
};

const LISTING_TONES: Record<ListingStatus, Tone> = {
  pending: "info",
  publishing: "info",
  published: "success",
  error: "danger",
};

function ToneBadge({ tone, label }: { tone: Tone; label: string }) {
  return (
    <Badge variant="outline" className={cn("font-medium", TONE_CLASSES[tone])}>
      {label}
    </Badge>
  );
}

export function StoreStatusBadge({ status }: { status: StoreStatus }) {
  return <ToneBadge tone={STORE_TONES[status]} label={STORE_STATUS_LABELS[status]} />;
}

export function ListingStatusBadge({ status }: { status: ListingStatus }) {
  return <ToneBadge tone={LISTING_TONES[status]} label={LISTING_STATUS_LABELS[status]} />;
}
