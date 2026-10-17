import type { CatalogSortColumn } from "@sellbridge/shared/supplier-panel-catalog-schemas";
import { ArrowDownIcon, ArrowUpIcon, ArrowsDownUpIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export interface CatalogSort {
  sort: CatalogSortColumn;
  direction: "asc" | "desc";
}

/**
 * A column header that sorts the list: the active column always shows its direction, the
 * others a quiet two-way arrow, so sorting is never a hidden feature.
 */
export function SortableHeader({
  column,
  label,
  current,
  onSort,
  align = "start",
}: {
  column: CatalogSortColumn;
  label: string;
  current: CatalogSort;
  onSort: (sort: CatalogSort) => void;
  align?: "start" | "end";
}) {
  const active = current.sort === column;
  const nextDirection = active && current.direction === "asc" ? "desc" : "asc";
  const Icon = active
    ? current.direction === "asc"
      ? ArrowUpIcon
      : ArrowDownIcon
    : ArrowsDownUpIcon;
  return (
    <button
      type="button"
      onClick={() => onSort({ sort: column, direction: nextDirection })}
      aria-label={`${label}${active ? `, ordenado ${current.direction === "asc" ? "crescente" : "decrescente"}` : ""}. Ordenar ${nextDirection === "asc" ? "crescente" : "decrescente"}`}
      className={cn(
        "-mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-medium transition-colors select-none hover:bg-muted hover:text-foreground outline-none focus-visible:ring-4 focus-visible:ring-ring/30",
        active ? "text-foreground" : "text-muted-foreground",
        align === "end" && "flex-row-reverse",
      )}
    >
      {label}
      <Icon className={cn("size-3.5", !active && "opacity-60")} aria-hidden="true" />
    </button>
  );
}
