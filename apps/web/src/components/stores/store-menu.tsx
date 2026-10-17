import { Link } from "@tanstack/react-router";
import { type ReactNode, useId, useRef } from "react";
import {
  ArrowsLeftRightIcon,
  ChatCircleDotsIcon,
  DotsThreeIcon,
  PackageIcon,
  SignOutIcon,
  StorefrontIcon,
} from "@phosphor-icons/react";
import { storeHealth } from "@sellbridge/shared/store-attention";
import { StoreHealthSection, storeHealthSummary } from "@/components/stores/store-health";
import { StoreStatusChip } from "@/components/stores/store-status-badge";
import { STORES_LOCKED_REASON, useStoresLocked } from "@/components/stores/stores-lock";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supportTicketSearch } from "@/features/support/talk-to-support";
import { cn } from "@/lib/utils";
import type { StoreWithActivity } from "./store-list";

/** The tinted square each menu action sits in, colored by what the action does. */
const MENU_TILE_TONES = {
  publish:
    "bg-emerald-500/14 text-emerald-600 group-data-highlighted/dropdown-menu-item:bg-emerald-500/22 dark:text-emerald-400",
  view: "bg-sky-500/14 text-sky-600 group-data-highlighted/dropdown-menu-item:bg-sky-500/22 dark:text-sky-400",
  supplier:
    "bg-violet-500/14 text-violet-600 group-data-highlighted/dropdown-menu-item:bg-violet-500/22 dark:text-violet-400",
  danger: "bg-destructive/12 group-data-highlighted/dropdown-menu-item:bg-destructive/22",
} as const;

/**
 * The tile already carries the danger color, so the highlighted row keeps the neutral lift
 * instead of stacking a red wash behind a red square.
 */
const NEUTRAL_DESTRUCTIVE_HIGHLIGHT =
  "data-[variant=destructive]:data-highlighted:bg-foreground/9 dark:data-[variant=destructive]:data-highlighted:bg-foreground/9";

function MenuTile({ tone, children }: { tone: keyof typeof MENU_TILE_TONES; children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-100",
        MENU_TILE_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

/** What the store menu offers: who it is, where to go next and, set apart, disconnecting. */
export interface StoreRowActions {
  onDisconnect: () => void;
  onChangeSupplier: () => void;
}

/** Who the store is, its status and its health, above the actions. */
function StoreMenuHeader({
  store,
  storeName,
  marketplaceLabel,
}: {
  store: StoreWithActivity;
  storeName: string;
  marketplaceLabel: string;
}) {
  return (
    <>
      <DropdownMenuLabel className="flex items-center gap-3 px-2.5 pt-2 pb-2.5">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{storeName}</span>
          <span className="block truncate text-xs font-normal">{marketplaceLabel}</span>
        </span>
        <StoreStatusChip status={storeHealth(store)} />
      </DropdownMenuLabel>
      <StoreHealthSection store={{ ...store, lastSyncedAt: store.activity.lastSyncedAt }} />
    </>
  );
}

/** Opens "Novo chamado" already about this store (item 27.a). */
function TalkToSupportItem({ storeId, storeName }: { storeId: string; storeName: string }) {
  return (
    <DropdownMenuItem asChild className="gap-2.5 py-1.5 pl-1.5">
      <Link
        to="/suporte/novo"
        search={supportTicketSearch({ kind: "store", id: storeId, name: storeName })}
      >
        <MenuTile tone="view">
          <ChatCircleDotsIcon weight="bold" />
        </MenuTile>
        Falar com o suporte
      </Link>
    </DropdownMenuItem>
  );
}

function StoreMenuEntries({
  store,
  storeName,
  marketplaceLabel,
  actions,
}: {
  store: StoreWithActivity;
  storeName: string;
  marketplaceLabel: string;
  actions: StoreRowActions;
}) {
  const locked = useStoresLocked();
  return (
    <>
      <StoreMenuHeader store={store} storeName={storeName} marketplaceLabel={marketplaceLabel} />
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild className="gap-2.5 py-1.5 pl-1.5">
        <Link to="/catalogo">
          <MenuTile tone="publish">
            <PackageIcon weight="bold" />
          </MenuTile>
          Publicar produtos
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild className="gap-2.5 py-1.5 pl-1.5">
        <Link to="/publicacoes">
          <MenuTile tone="view">
            <StorefrontIcon weight="bold" />
          </MenuTile>
          Ver publicações
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={actions.onChangeSupplier} className="gap-2.5 py-1.5 pl-1.5">
        <MenuTile tone="supplier">
          <ArrowsLeftRightIcon weight="bold" />
        </MenuTile>
        {store.supplierId === null ? "Escolher fornecedor" : "Trocar fornecedor"}
      </DropdownMenuItem>
      <TalkToSupportItem storeId={store.id} storeName={storeName} />
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        disabled={locked}
        title={locked ? STORES_LOCKED_REASON : undefined}
        onSelect={actions.onDisconnect}
        className={cn("gap-2.5 py-1.5 pl-1.5", NEUTRAL_DESTRUCTIVE_HIGHLIGHT)}
      >
        <MenuTile tone="danger">
          <SignOutIcon weight="bold" />
        </MenuTile>
        Desconectar
      </DropdownMenuItem>
    </>
  );
}

export function StoreMenu({
  store,
  storeName,
  marketplaceLabel,
  actions,
}: {
  store: StoreWithActivity;
  storeName: string;
  marketplaceLabel: string;
  actions: StoreRowActions;
}) {
  // Opened with the mouse, the menu leaves focus where it is on close; returning it to the
  // trigger would light up its keyboard focus ring for a pointer user.
  const openedWithPointer = useRef(false);
  const healthId = useId();
  return (
    <DropdownMenu>
      <span id={healthId} className="sr-only" suppressHydrationWarning>
        {storeHealthSummary({ ...store, lastSyncedAt: store.activity.lastSyncedAt })}
      </span>
      <DropdownMenuTrigger asChild>
        <Button
          onPointerDown={() => {
            openedWithPointer.current = true;
          }}
          onKeyDown={() => {
            openedWithPointer.current = false;
          }}
          variant="ghost"
          size="icon-sm"
          aria-label={`Opções de ${storeName}`}
          aria-describedby={healthId}
          className="col-start-2 row-start-1 justify-self-end rounded-full text-muted-foreground md:col-start-5"
        >
          <DotsThreeIcon weight="bold" className="size-5" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-72"
        onCloseAutoFocus={(event) => {
          if (!openedWithPointer.current) {
            return;
          }
          event.preventDefault();
        }}
      >
        <StoreMenuEntries
          store={store}
          storeName={storeName}
          marketplaceLabel={marketplaceLabel}
          actions={actions}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
