import type { ListingStatusCounts } from "@sellbridge/database/repositories";
import { LISTING_FILTER_STATUSES, type ListingFilterStatus } from "@sellbridge/shared/schemas";
import { SegmentedControl } from "@/components/data/segmented-control";

/** "all" stands in for the absent status filter, since the control needs a string per option. */
const OPTIONS = ["all", ...LISTING_FILTER_STATUSES] as const;
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

/** The search schema only accepts tab statuses, so the filter always has a matching tab. */
export function ListingStatusTabs({
  value,
  counts,
  onChange,
}: {
  value: ListingFilterStatus | undefined;
  counts: ListingStatusCounts | undefined;
  onChange: (status: ListingFilterStatus | undefined) => void;
}) {
  return (
    <SegmentedControl
      legend="Filtrar por status"
      options={OPTIONS}
      labels={LABELS}
      counts={tabCounts(counts)}
      value={value ?? "all"}
      onChange={(option) => onChange(option === "all" ? undefined : option)}
    />
  );
}
