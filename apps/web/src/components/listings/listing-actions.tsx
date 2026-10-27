import type { ListingOverviewRow } from "@sellbridge/database/repositories";
import { LISTING_STATUS_LABELS } from "@sellbridge/shared/schemas";
import {
  ArrowUpRightIcon,
  ChatCircleDotsIcon,
  DotsThreeIcon,
  ProhibitIcon,
  StorefrontIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
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
import {
  listingNamedState,
  listingRunState,
  type ListingRunState,
} from "@/features/listings/listing-health";
import { useBulkListingActions } from "@/features/listings/use-listing-actions";
import { supportTicketSearch } from "@/features/support/talk-to-support";
import { CONTROL_HINTS } from "@/components/icons/action-icons";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import {
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
function RunStateChip({
  state,
  named = state,
}: {
  state: ListingRunState;
  /** The word shown, when it differs from the color (a listing the catalog stops). */
  named?: ListingRunState;
}) {
  return (
    <span
      className={cn(
        "ml-auto inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-xs font-medium",
        RUN_STATE_TEXT[state],
        RUN_STATE_TINT[state],
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", RUN_STATE_DOT[state])} />
      {RUN_STATE_LABEL[named]}
    </span>
  );
}

/** Kept off by a problem: nothing to toggle, so the item explains instead of acting. */
function UnavailableItem({ named }: { named: ListingRunState }) {
  return (
    <DropdownMenuItem
      disabled
      className="text-muted-foreground data-disabled:opacity-100 *:[svg]:text-destructive"
    >
      <ProhibitIcon weight="duotone" aria-hidden="true" />
      Indisponível
      <RunStateChip state="off" named={named} />
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
  // A product the supplier keeps off can still be live somewhere (outside the region): it
  // cannot be switched on, but it can be paused.
  const canStillPause =
    row.unavailable !== null && row.stores.some((store) => store.status === "published");
  if (state === "off" && !canStillPause) {
    return <UnavailableItem named={listingNamedState(row)} />;
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
      trailing={<RunStateChip state={state} named={listingNamedState(row)} />}
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
      <span className="min-w-0 flex-1 truncate">{store.storeName}</span>
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

function TalkToSupportItem({ row }: { row: ListingOverviewRow }) {
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild className={ACTION_ITEM}>
        <Link
          to="/suporte/novo"
          search={supportTicketSearch({ kind: "listing", id: row.listingId, name: row.title })}
        >
          <ChatCircleDotsIcon weight="duotone" aria-hidden="true" />
          Falar com o suporte
        </Link>
      </DropdownMenuItem>
      <TalkToSupplierItem row={row} />
    </>
  );
}

/**
 * Opens a conversation with the supplier of the product. Every store of a listing sells that
 * same supplier (one store, one supplier), so the first store is enough to reach them.
 */
function TalkToSupplierItem({ row }: { row: ListingOverviewRow }) {
  const store = row.stores[0];
  if (store === undefined) {
    return null;
  }
  return (
    <DropdownMenuItem asChild className={ACTION_ITEM}>
      <Link to="/suporte/fornecedores/novo" search={{ loja: store.storeConnectionId }}>
        <StorefrontIcon weight="duotone" aria-hidden="true" />
        Falar com o fornecedor
      </Link>
    </DropdownMenuItem>
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
      <Hint label={CONTROL_HINTS.listingActions} openOnTap={false}>
        <DropdownMenuTrigger asChild>
          {/* The state reads as a word beside its dot, so it never depends on color alone. */}
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Ações de ${row.title}`}
            className="absolute top-3 right-3 h-8 gap-1.5 rounded-full bg-background pr-2 pl-2.5 text-xs font-medium text-muted-foreground hover:bg-background hover:text-foreground focus-visible:ring-foreground/15 aria-expanded:bg-background"
          >
            <span aria-hidden="true" className={cn("size-2 rounded-full", RUN_STATE_DOT[state])} />
            <span aria-hidden="true" className={RUN_STATE_TEXT[state]}>
              {RUN_STATE_LABEL[listingNamedState(row)]}
            </span>
            <DotsThreeIcon weight="bold" className="size-5" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent align="end" className="w-60">
        <EditPriceItem onEditPrice={onEditPrice} />
        <RunStateItem row={row} />
        <StoresSection row={row} />
        <TalkToSupportItem row={row} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
