import { formatCents } from "@sellbridge/shared/money";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useRef } from "react";
import {
  DotsThreeIcon,
  PackageIcon,
  PlugIcon,
  SignOutIcon,
  StorefrontIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { StoreStatusChip, StoreStatusDot } from "@/components/stores/store-status-badge";
import { displayStoreName } from "@/features/stores/store-name";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { listStores } from "@/features/stores/stores.functions";
import { formatAbsoluteTime, formatRelativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";
import { GroupedList, MarkSlot } from "./grouped-list";
import { MarketplaceMark } from "./marketplace-mark";

export type StoreWithActivity = Awaited<ReturnType<typeof listStores>>["stores"][number];

/** Identity, three figures and the row menu; the figures fold under the name on small screens. */
const ROW_COLUMNS =
  "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_7rem_6rem_8rem_2.25rem]";

const compactMoney = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5 md:text-right">
      <dt className="text-xs text-muted-foreground md:sr-only">{label}</dt>
      <dd className="text-subhead font-semibold tracking-tight tabular-nums">{value}</dd>
    </div>
  );
}

function ConnectionProblem({ store }: { store: StoreWithActivity }) {
  if (store.status === "connected") {
    return null;
  }
  return (
    <div className="mt-3 flex items-start gap-3 rounded-2xl bg-destructive/10 p-3 text-sm md:ml-20">
      <WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
      <p className="flex-1">
        {store.lastError ??
          "O acesso a esta loja expirou. Reconecte para voltar a sincronizar pedidos e estoque."}
      </p>
      <Button asChild size="sm">
        <a href={`/api/oauth/${store.marketplace}/start`}>
          <PlugIcon aria-hidden="true" />
          Reconectar
        </a>
      </Button>
    </div>
  );
}

/** A connected store with nothing live and nothing failing: zero figures, and one step to take. */
function isIdle(store: StoreWithActivity) {
  const { failedListings, liveListings } = store.activity;
  return store.status === "connected" && liveListings === 0 && failedListings === 0;
}

/**
 * The store's next step, as a small button beside its name so every row keeps the same height:
 * fix failed listings first, otherwise send an idle store to the catalog. Stores already selling
 * get none.
 */
function NextStepAction({ store, storeName }: { store: StoreWithActivity; storeName: string }) {
  const { failedListings } = store.activity;
  if (failedListings > 0) {
    return (
      <Button asChild variant="destructive" size="sm" className="shrink-0">
        <Link
          to="/publicacoes"
          search={{ status: "error" }}
          aria-label={`${failedListings} ${failedListings === 1 ? "publicação com erro" : "publicações com erro"} em ${storeName}`}
        >
          <WarningCircleIcon weight="bold" aria-hidden="true" />
          {failedListings} com erro
        </Link>
      </Button>
    );
  }
  if (!isIdle(store)) {
    return null;
  }
  return (
    <Button asChild variant="secondary" size="sm" className="shrink-0">
      <Link to="/catalogo" aria-label={`Publicar produtos em ${storeName}`}>
        <PackageIcon weight="bold" aria-hidden="true" />
        Publicar
      </Link>
    </Button>
  );
}

/** The tinted square each menu action sits in, colored by what the action does. */
const MENU_TILE_TONES = {
  publish:
    "bg-emerald-500/14 text-emerald-600 group-data-highlighted/dropdown-menu-item:bg-emerald-500/22 dark:text-emerald-400",
  view: "bg-sky-500/14 text-sky-600 group-data-highlighted/dropdown-menu-item:bg-sky-500/22 dark:text-sky-400",
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
function StoreMenuEntries({
  store,
  storeName,
  marketplaceLabel,
  onDisconnect,
}: {
  store: StoreWithActivity;
  storeName: string;
  marketplaceLabel: string;
  onDisconnect: () => void;
}) {
  return (
    <>
      <DropdownMenuLabel className="flex items-center gap-3 px-2.5 pt-2 pb-2.5">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{storeName}</span>
          <span className="block truncate text-xs font-normal">{marketplaceLabel}</span>
        </span>
        <StoreStatusChip status={store.status} />
      </DropdownMenuLabel>
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
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        onSelect={onDisconnect}
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

function StoreMenu({
  store,
  storeName,
  marketplaceLabel,
  onDisconnect,
}: {
  store: StoreWithActivity;
  storeName: string;
  marketplaceLabel: string;
  onDisconnect: () => void;
}) {
  // Opened with the mouse, the menu leaves focus where it is on close; returning it to the
  // trigger would light up its keyboard focus ring for a pointer user.
  const openedWithPointer = useRef(false);
  return (
    <DropdownMenu>
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
          onDisconnect={onDisconnect}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StoreRow({
  store,
  marketplaceLabel,
  onDisconnect,
}: {
  store: StoreWithActivity;
  marketplaceLabel: string;
  onDisconnect: () => void;
}) {
  const { activity } = store;
  const name = displayStoreName(store.shopName);
  return (
    <li className="px-5 py-4">
      <div className={`grid items-center gap-x-4 gap-y-3 ${ROW_COLUMNS}`}>
        <div className="flex min-w-0 items-center gap-4">
          <MarkSlot>
            <MarketplaceMark marketplace={store.marketplace} className="size-10" />
            <StoreStatusDot status={store.status} className="absolute right-0 -bottom-0.5" />
          </MarkSlot>
          <div className="min-w-0 flex-1 space-y-0.5">
            <h2 className="truncate font-semibold" title={store.shopName}>
              {name}
            </h2>
            <p className="text-sm text-muted-foreground md:truncate">
              {marketplaceLabel} · Conectada{" "}
              <time
                dateTime={store.connectedAt.toISOString()}
                title={formatAbsoluteTime(store.connectedAt)}
                suppressHydrationWarning
              >
                {formatRelativeTime(store.connectedAt)}
              </time>
            </p>
          </div>
          <NextStepAction store={store} storeName={name} />
        </div>
        {/* An idle store's zeros are filler, not figures: they step back behind its button. */}
        <dl
          className={cn(
            "col-span-2 row-start-2 grid grid-cols-3 gap-3 pl-20 md:col-span-3 md:col-start-2 md:row-start-1 md:grid-cols-subgrid md:gap-x-4 md:pl-0",
            isIdle(store) && "[&_dd]:font-medium [&_dd]:text-muted-foreground",
          )}
        >
          <Stat label="Publicações" value={activity.liveListings.toLocaleString("pt-BR")} />
          <Stat label="Vendas" value={activity.orders.toLocaleString("pt-BR")} />
          <Stat label="Receita" value={compactMoney.format(activity.revenueCents / 100)} />
        </dl>
        <span className="sr-only">Receita exata: {formatCents(activity.revenueCents)}</span>
        <StoreMenu
          store={store}
          storeName={name}
          marketplaceLabel={marketplaceLabel}
          onDisconnect={onDisconnect}
        />
      </div>
      <ConnectionProblem store={store} />
    </li>
  );
}

/** Connected stores as one grouped list, with the 30-day figures lined up in columns. */
export function StoreList({
  stores,
  labels,
  onDisconnect,
}: {
  stores: StoreWithActivity[];
  labels: Map<string, string>;
  onDisconnect: (store: StoreWithActivity) => void;
}) {
  return (
    <div className="space-y-2">
      <div
        aria-hidden="true"
        className={`hidden gap-x-4 px-5 text-footnote text-muted-foreground md:grid ${ROW_COLUMNS}`}
      >
        <span>Conectadas · {stores.length}</span>
        <span className="text-right">Publicações</span>
        <span className="text-right">Vendas</span>
        <span className="text-right">Receita</span>
      </div>
      <GroupedList>
        {stores.map((store) => (
          <StoreRow
            key={store.id}
            store={store}
            marketplaceLabel={labels.get(store.marketplace) ?? store.marketplace}
            onDisconnect={() => onDisconnect(store)}
          />
        ))}
      </GroupedList>
    </div>
  );
}
