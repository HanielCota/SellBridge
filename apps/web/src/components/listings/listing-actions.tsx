import type { ListingOverviewRow } from "@sellbridge/database/repositories";
import { LISTING_STATUS_LABELS } from "@sellbridge/shared/schemas";
import { ArrowUpRightIcon, DotsThreeIcon, ProhibitIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { MarketplaceMark } from "@/components/stores/marketplace-mark";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { listingRunState, type ListingRunState } from "@/features/listings/listing-health";
import { useBulkListingActions, useSimulateSale } from "@/features/listings/use-listing-actions";
import { displayStoreName } from "@/features/stores/store-name";
import { cn } from "@/lib/utils";
import {
  useFlaskMotion,
  usePauseMotion,
  usePlayMotion,
  useTagMotion,
  type MenuIconMotion,
} from "./menu-icon-motion";
import {
  RUN_STATE_DOT,
  RUN_STATE_LABEL,
  RUN_STATE_TEXT,
  RUN_STATE_TINT,
  STORE_STATUS_DOT,
} from "./run-state-style";

type ListingStore = ListingOverviewRow["stores"][number];

/** Actions read in full white with solid icons, so they stand apart from the store list. */
const ACTION_ITEM = "text-foreground *:[svg]:text-foreground";

function ActionItem({
  motion,
  label,
  iconClassName,
  trailing,
  disabled = false,
  keepOpen = false,
  onSelect,
}: {
  motion: MenuIconMotion;
  label: string;
  /** Recolors the icon, e.g. with the listing's state. */
  iconClassName?: string;
  trailing?: ReactNode;
  disabled?: boolean;
  /** Leaves the menu open after acting, so the result shows in place. */
  keepOpen?: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      className={cn(ACTION_ITEM, iconClassName)}
      disabled={disabled}
      onSelect={(event) => {
        if (keepOpen) {
          event.preventDefault();
        }
        onSelect();
      }}
      onFocus={motion.onHighlight}
    >
      {motion.icon}
      {label}
      {trailing}
    </DropdownMenuItem>
  );
}

function EditPriceItem({ onEditPrice }: { onEditPrice: () => void }) {
  const motion = useTagMotion();
  return <ActionItem motion={motion} label="Editar preço" onSelect={onEditPrice} />;
}

/** The listing's state in its color, so the action beside it reads as "this is what changes". */
function RunStateChip({ state }: { state: ListingRunState }) {
  return (
    <span
      className={cn(
        "ml-auto inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-xs font-medium",
        RUN_STATE_TEXT[state],
        RUN_STATE_TINT[state],
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", RUN_STATE_DOT[state])} />
      {RUN_STATE_LABEL[state]}
    </span>
  );
}

/** Kept off by a problem: nothing to toggle, so the item explains instead of acting. */
function UnavailableItem() {
  return (
    <DropdownMenuItem
      disabled
      className="text-muted-foreground data-disabled:opacity-100 *:[svg]:text-destructive"
    >
      <ProhibitIcon weight="duotone" aria-hidden="true" />
      Indisponível
      <RunStateChip state="off" />
    </DropdownMenuItem>
  );
}

/**
 * Pause or resume, colored by where the listing is now: a green pause while it runs, an amber
 * play while paused. Blocked listings say why they cannot be switched on.
 */
function RunStateItem({ row }: { row: ListingOverviewRow }) {
  const { pause } = useBulkListingActions();
  const pauseMotion = usePauseMotion();
  const playMotion = usePlayMotion();
  const state = listingRunState(row);
  if (state === "off") {
    return <UnavailableItem />;
  }
  if (state === "paused") {
    return (
      <ActionItem
        motion={playMotion}
        label="Reativar"
        iconClassName="*:[svg]:text-amber-500"
        trailing={<RunStateChip state="paused" />}
        keepOpen
        onSelect={() => pause.mutate({ listingIds: [row.listingId], paused: false })}
      />
    );
  }
  return (
    <ActionItem
      motion={pauseMotion}
      label="Pausar"
      iconClassName={state === "live" ? "*:[svg]:text-emerald-500" : "*:[svg]:text-sky-500"}
      trailing={<RunStateChip state={state} />}
      disabled={state === "busy"}
      keepOpen
      onSelect={() => pause.mutate({ listingIds: [row.listingId], paused: true })}
    />
  );
}

function StoreRowContent({ store }: { store: ListingStore }) {
  return (
    <>
      <MarketplaceMark marketplace={store.marketplace} className="size-5 rounded-md" />
      <span className="min-w-0 flex-1 truncate">{displayStoreName(store.storeName)}</span>
      <span className="sr-only">, {LISTING_STATUS_LABELS[store.status]}</span>
      {store.externalUrl ? (
        <ArrowUpRightIcon
          aria-hidden="true"
          className="size-3.5 opacity-0 transition-[opacity,translate] duration-200 group-data-highlighted/dropdown-menu-item:translate-x-0.5 group-data-highlighted/dropdown-menu-item:-translate-y-0.5 group-data-highlighted/dropdown-menu-item:opacity-100 motion-reduce:transition-none"
        />
      ) : null}
      <span
        aria-hidden="true"
        className={cn("size-1.5 shrink-0 rounded-full", STORE_STATUS_DOT[store.status])}
      />
    </>
  );
}

/** Where the product is and how it is doing there; a store with a live ad opens it. */
function StoresSection({ row }: { row: ListingOverviewRow }) {
  if (row.stores.length === 0) {
    return null;
  }
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="px-2.5 pt-1.5 pb-1 text-xs font-normal text-muted-foreground">
        Lojas
      </DropdownMenuLabel>
      {row.stores.map((store) =>
        store.externalUrl ? (
          <DropdownMenuItem key={store.id} asChild title="Ver anúncio">
            <a href={store.externalUrl} target="_blank" rel="noreferrer">
              <StoreRowContent store={store} />
            </a>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem key={store.id} title={LISTING_STATUS_LABELS[store.status]}>
            <StoreRowContent store={store} />
          </DropdownMenuItem>
        ),
      )}
    </>
  );
}

function SimulateSaleItem({ row }: { row: ListingOverviewRow }) {
  const simulate = useSimulateSale();
  const motion = useFlaskMotion();
  const target = row.stores.find(
    (store) => store.marketplace === "mock" && store.status === "published",
  );
  if (!target) {
    return null;
  }
  return (
    <>
      <DropdownMenuSeparator />
      <ActionItem
        motion={motion}
        label="Simular venda"
        onSelect={() => simulate.mutate(target.id)}
      />
    </>
  );
}

/** Every action of a listing in one place; the button's dot shows its state without opening it. */
export function ListingMenu({
  row,
  onEditPrice,
}: {
  row: ListingOverviewRow;
  onEditPrice: () => void;
}) {
  const state = listingRunState(row);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Ações de ${row.title}`}
          title={RUN_STATE_LABEL[state]}
          className="absolute top-3 right-3 rounded-full bg-background text-muted-foreground hover:bg-background hover:text-foreground focus-visible:ring-foreground/15 aria-expanded:bg-background"
        >
          <DotsThreeIcon weight="bold" className="size-5" aria-hidden="true" />
          <span
            aria-hidden="true"
            className={cn(
              "absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-card",
              RUN_STATE_DOT[state],
            )}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <EditPriceItem onEditPrice={onEditPrice} />
        <RunStateItem row={row} />
        <StoresSection row={row} />
        <SimulateSaleItem row={row} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
