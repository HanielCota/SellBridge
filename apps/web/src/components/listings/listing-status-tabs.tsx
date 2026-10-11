import type { ListingStatusCounts } from "@sellbridge/database/repositories";
import type { ListingStatus } from "@sellbridge/shared/schemas";
import { SegmentedControl } from "@/components/data/segmented-control";

/** "all" stands in for the absent status filter, since the control needs a string per option. */
const OPTIONS = ["all", "published", "error", "paused"] as const satisfies readonly (
  ListingStatus | "all"
)[];
type TabOption = (typeof OPTIONS)[number];

const LABELS: Record<TabOption, string> = {
  all: "Todas",
  published: "No ar",
  error: "Com erro",
  paused: "Pausadas",
};

function tabCounts(counts: ListingStatusCounts | undefined) {
  if (!counts) {
    return undefined;
  }
  return {
    all: counts.all,
    published: counts.published,
    error: counts.error,
    paused: counts.paused,
  } satisfies Record<TabOption, number>;
}

function activeOption(value: ListingStatus | undefined): TabOption {
  return OPTIONS.find((option) => option === value) ?? "all";
}

export function ListingStatusTabs({
  value,
  counts,
  onChange,
}: {
  value: ListingStatus | undefined;
  counts: ListingStatusCounts | undefined;
  onChange: (status: ListingStatus | undefined) => void;
}) {
  return (
    <SegmentedControl
      legend="Filtrar por status"
      options={OPTIONS}
      labels={LABELS}
      counts={tabCounts(counts)}
      value={activeOption(value)}
      onChange={(option) => onChange(option === "all" ? undefined : option)}
    />
  );
}
