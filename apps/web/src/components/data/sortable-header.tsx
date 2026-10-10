import { ArrowDownIcon, ArrowUpIcon, ArrowsDownUpIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export type SortDirection = "asc" | "desc";

function SortIcon({ isActive, direction }: { isActive: boolean; direction: SortDirection }) {
  if (!isActive) {
    return <ArrowsDownUpIcon className="size-3.5" aria-hidden="true" />;
  }
  if (direction === "desc") {
    return <ArrowDownIcon className="size-3.5" aria-hidden="true" />;
  }
  return <ArrowUpIcon className="size-3.5" aria-hidden="true" />;
}

function sortStateLabel(isActive: boolean, direction: SortDirection): string {
  if (!isActive) {
    return "";
  }
  return direction === "desc" ? " (ordem decrescente)" : " (ordem crescente)";
}

/**
 * Column header that sorts by its field. The first click sorts descending; clicking the
 * active column flips the direction.
 */
export function SortableHeader({
  label,
  isActive,
  direction,
  onSort,
  align,
}: {
  label: string;
  isActive: boolean;
  direction: SortDirection;
  onSort: (direction: SortDirection) => void;
  align?: "right" | undefined;
}) {
  const nextDirection = isActive && direction === "desc" ? "asc" : "desc";
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1 font-medium hover:text-foreground",
        align === "right" && "ml-auto",
      )}
      aria-label={`Ordenar por ${label.toLowerCase()}${sortStateLabel(isActive, direction)}`}
      onClick={() => onSort(nextDirection)}
    >
      {label}
      <SortIcon isActive={isActive} direction={direction} />
    </button>
  );
}
