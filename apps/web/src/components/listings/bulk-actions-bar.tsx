import type { ListingOverviewRow } from "@sellbridge/database/repositories";
import { ArrowClockwiseIcon, PauseIcon, PlayIcon, XIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { type ComponentType, useState } from "react";
import { Button } from "@/components/ui/button";
import { useBulkListingActions } from "@/features/listings/use-listing-actions";

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** How many stores of the selection each bulk action would actually touch. */
function countStores(rows: readonly ListingOverviewRow[]) {
  const counts = { total: 0, published: 0, paused: 0, error: 0 };
  for (const store of rows.flatMap((row) => row.stores)) {
    counts.total += 1;
    if (store.status === "published" || store.status === "paused" || store.status === "error") {
      counts[store.status] += 1;
    }
  }
  return counts;
}

type StoreCounts = ReturnType<typeof countStores>;

function ActionButton({
  icon: Icon,
  count,
  tone,
  disabled,
  onClick,
  label,
}: {
  icon: ComponentType<{ "aria-hidden"?: boolean }>;
  count: number;
  tone?: "danger";
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={disabled}
      onClick={onClick}
      aria-label={`${label} em ${plural(count, "loja", "lojas")}`}
      className={cn(
        "pr-1.5",
        tone === "danger" && "text-destructive hover:bg-destructive/10 hover:text-destructive",
      )}
    >
      <Icon aria-hidden />
      {label}
      <span
        aria-hidden="true"
        className={cn(
          "min-w-5 rounded-full px-1.5 text-center text-xs leading-5 tabular-nums",
          tone === "danger" ? "bg-destructive/15" : "bg-foreground/10 text-muted-foreground",
        )}
      >
        {count}
      </span>
    </Button>
  );
}

function BulkActions({
  listingIds,
  stores,
  onDone,
}: {
  listingIds: string[];
  stores: StoreCounts;
  onDone: () => void;
}) {
  const { retry, pause, isPending } = useBulkListingActions(onDone);
  // Pausing updates the rows optimistically; hold the counts from the click so the
  // buttons don't swap (Pausar -> Reativar) while the request is still running.
  const [held, setHeld] = useState<StoreCounts | null>(null);
  const shown = isPending && held !== null ? held : stores;
  function run(action: () => void) {
    setHeld(stores);
    action();
  }
  if (shown.published + shown.paused + shown.error === 0) {
    return <p className="px-2 text-sm text-muted-foreground">Aguardando publicação</p>;
  }
  return (
    <>
      {shown.published > 0 ? (
        <ActionButton
          icon={PauseIcon}
          count={shown.published}
          disabled={isPending}
          onClick={() => run(() => pause.mutate({ listingIds, paused: true }))}
          label="Pausar"
        />
      ) : null}
      {shown.paused > 0 ? (
        <ActionButton
          icon={PlayIcon}
          count={shown.paused}
          disabled={isPending}
          onClick={() => run(() => pause.mutate({ listingIds, paused: false }))}
          label="Reativar"
        />
      ) : null}
      {shown.error > 0 ? (
        <ActionButton
          icon={ArrowClockwiseIcon}
          count={shown.error}
          tone="danger"
          disabled={isPending}
          onClick={() => run(() => retry.mutate(listingIds))}
          label="Reprocessar"
        />
      ) : null}
    </>
  );
}

/**
 * Floats while rows are selected. Only offers the actions that would change something,
 * each with the number of stores it affects, so the reseller knows the impact before clicking.
 */
export function BulkActionsBar({
  rows,
  onClear,
}: {
  rows: readonly ListingOverviewRow[];
  onClear: () => void;
}) {
  if (rows.length === 0) {
    return null;
  }
  const stores = countStores(rows);
  return (
    <section
      aria-label="Ações em lote"
      data-bulk-actions=""
      className="sticky bottom-4 z-20 mx-auto mt-4 flex w-fit max-w-full animate-in flex-wrap items-center justify-center gap-1 rounded-full border border-border bg-popover/90 p-1.5 pl-4 text-popover-foreground shadow-lg shadow-black/20 backdrop-blur-md duration-200 fade-in slide-in-from-bottom-3 motion-reduce:slide-in-from-bottom-0"
    >
      <p className="text-sm font-medium whitespace-nowrap" aria-live="polite">
        {plural(rows.length, "produto", "produtos")}
        <span className="text-muted-foreground"> · {plural(stores.total, "loja", "lojas")}</span>
      </p>
      <span aria-hidden="true" className="mx-2 h-5 w-px bg-border" />
      <BulkActions listingIds={rows.map((row) => row.listingId)} stores={stores} onDone={onClear} />
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Limpar seleção"
        className="text-muted-foreground"
        onClick={onClear}
      >
        <XIcon aria-hidden="true" />
      </Button>
    </section>
  );
}
