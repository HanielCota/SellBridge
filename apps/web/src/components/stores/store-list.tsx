import { formatCents } from "@sellbridge/shared/money";
import { Link } from "@tanstack/react-router";
import { PackageIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { storeHealth } from "@sellbridge/shared/store-attention";
import { StoreMenu, type StoreRowActions } from "@/components/stores/store-menu";
import { StoreStatusDot } from "@/components/stores/store-status-badge";
import { displayStoreName } from "@/features/stores/store-name";
import { Button } from "@/components/ui/button";
import type { listStores } from "@/features/stores/stores.functions";
import { formatAbsoluteTime, formatRelativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";
import { GroupedList, MarkSlot } from "./grouped-list";
import { MarketplaceMark } from "./marketplace-mark";
import { ReconnectAction } from "./store-reconnect-action";

export type StoreWithActivity = Awaited<ReturnType<typeof listStores>>["stores"][number];

/** The supplier a shop sells, as its row names it. */
export interface StoreSupplierLabel {
  name: string;
  active: boolean;
}

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

type StoreProblem = Exclude<StoreWithActivity["status"], "connected">;

/** Why a store stopped syncing, in its tone: an expired grant warns, a failure is an error. */
const PROBLEM_TONES: Record<StoreProblem, string> = {
  expired: "text-amber-700 dark:text-amber-400",
  error: "text-destructive",
  disconnected: "text-muted-foreground",
};

/** What to say when the marketplace left no message of its own. */
const PROBLEM_FALLBACKS: Record<StoreProblem, string> = {
  expired: "A autorização da loja expirou",
  error: "A loja parou de sincronizar",
  disconnected: "A loja foi desconectada",
};

/** A stored message as a sentence fragment: trimmed, without its closing period. */
function trimMessage(message: string) {
  return message.trim().replace(/\.+$/, "");
}

/** The store's problem as one sentence, ready to take the "sincronização pausada" suffix. */
function problemMessage(status: StoreProblem, lastError: string | null) {
  const message = trimMessage(lastError ?? "");
  if (message === "") {
    return PROBLEM_FALLBACKS[status];
  }
  return message;
}

/**
 * A connected store whose last refresh failed for a passing reason: it keeps syncing and is
 * retried, so the figures stay, but the reason replaces "Conectada" in the warning tone.
 */
function AttentionSubtitle({
  message,
  failedListings,
  storeName,
}: {
  message: string;
  failedListings: number;
  storeName: string;
}) {
  return (
    <p className="text-sm text-amber-700 md:truncate dark:text-amber-400" title={message}>
      {message}
      {failedListings > 0 && (
        <>
          {" · "}
          <FailedListingsLink count={failedListings} storeName={storeName} />
        </>
      )}
    </p>
  );
}

/** A connected store with nothing live and nothing failing: zero figures, and one step to take. */
function isIdle(store: StoreWithActivity) {
  const { failedListings, liveListings } = store.activity;
  return store.status === "connected" && liveListings === 0 && failedListings === 0;
}

/** Failed listings as a quiet link in the store's subtitle, leading to the listings to fix. */
function FailedListingsLink({ count, storeName }: { count: number; storeName: string }) {
  const label = count === 1 ? "1 publicação com erro" : `${count} publicações com erro`;
  return (
    <Link
      to="/publicacoes"
      search={{ status: "error" }}
      aria-label={`${label} em ${storeName}`}
      className="text-destructive underline-offset-4 hover:underline"
    >
      {label}
    </Link>
  );
}

function StoreSubtitle({
  store,
  storeName,
  marketplaceLabel,
}: {
  store: StoreWithActivity;
  storeName: string;
  marketplaceLabel: string;
}) {
  if (store.status !== "connected") {
    const problem = `${problemMessage(store.status, store.lastError)} · sincronização pausada`;
    // Truncated on wide screens, so the full message stays one hover away.
    return (
      <p className={cn("text-sm md:truncate", PROBLEM_TONES[store.status])} title={problem}>
        {problem}
      </p>
    );
  }
  const { failedListings } = store.activity;
  if (storeHealth(store) === "attention") {
    return (
      <AttentionSubtitle
        message={trimMessage(store.lastError ?? "")}
        failedListings={failedListings}
        storeName={storeName}
      />
    );
  }
  return (
    <p className="text-sm text-muted-foreground md:truncate">
      {marketplaceLabel} · Conectada{" "}
      <time
        dateTime={store.connectedAt.toISOString()}
        title={formatAbsoluteTime(store.connectedAt)}
        suppressHydrationWarning
      >
        {formatRelativeTime(store.connectedAt)}
      </time>
      {failedListings > 0 && (
        <>
          {" · "}
          <FailedListingsLink count={failedListings} storeName={storeName} />
        </>
      )}
    </p>
  );
}

/** Who the shop sells; a shop with no supplier yet asks for one before it can publish again. */
function StoreSupplierLine({
  store,
  supplier,
  onChangeSupplier,
}: {
  store: StoreWithActivity;
  supplier: StoreSupplierLabel | undefined;
  onChangeSupplier: () => void;
}) {
  if (store.supplierId === null || supplier === undefined) {
    return (
      <button
        type="button"
        onClick={onChangeSupplier}
        className="flex items-center gap-1.5 rounded-md text-left text-sm font-medium text-amber-700 underline-offset-4 hover:underline focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none dark:text-amber-400"
      >
        <WarningCircleIcon weight="fill" className="size-4 shrink-0" aria-hidden="true" />
        Escolha o fornecedor desta loja
      </button>
    );
  }
  return (
    <p className="text-sm text-muted-foreground md:truncate">
      Vende <span className="font-medium text-foreground">{supplier.name}</span>
      {supplier.active ? null : " · fornecedor inativo"}
    </p>
  );
}

/** An idle store gets one small step beside its name; stores already selling get none. */
function PublishAction({ store, storeName }: { store: StoreWithActivity; storeName: string }) {
  if (!isIdle(store)) {
    return null;
  }
  return (
    <Button asChild variant="outline" size="sm" className="shrink-0">
      {/* Only this store's supplier: products of another one could not be published here. */}
      <Link
        to="/catalogo"
        search={{ supplier: store.supplierId ?? undefined }}
        aria-label={`Publicar produtos em ${storeName}`}
      >
        <PackageIcon weight="bold" aria-hidden="true" />
        {/* On a phone the label would squeeze the subtitle into a column; the icon carries it. */}
        <span className="max-md:sr-only">Publicar</span>
      </Link>
    </Button>
  );
}

function StoreFigures({ store }: { store: StoreWithActivity }) {
  const { activity } = store;
  return (
    <>
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
    </>
  );
}

function StoreRow({
  store,
  marketplaceLabel,
  supplier,
  actions,
}: {
  store: StoreWithActivity;
  marketplaceLabel: string;
  supplier: StoreSupplierLabel | undefined;
  actions: StoreRowActions;
}) {
  const name = displayStoreName(store.shopName);
  return (
    <li className="px-5 py-4">
      <div className={`grid items-center gap-x-4 gap-y-3 ${ROW_COLUMNS}`}>
        <div className="flex min-w-0 items-center gap-4">
          <MarkSlot>
            <MarketplaceMark marketplace={store.marketplace} className="size-10" />
            <StoreStatusDot status={storeHealth(store)} className="absolute right-0 -bottom-0.5" />
          </MarkSlot>
          <div className="min-w-0 flex-1 space-y-0.5">
            <h2 className="truncate font-semibold" title={store.shopName}>
              {name}
            </h2>
            <StoreSubtitle store={store} storeName={name} marketplaceLabel={marketplaceLabel} />
            <StoreSupplierLine
              store={store}
              supplier={supplier}
              onChangeSupplier={actions.onChangeSupplier}
            />
          </div>
          <PublishAction store={store} storeName={name} />
        </div>
        {store.status === "connected" ? (
          <StoreFigures store={store} />
        ) : (
          <ReconnectAction marketplace={store.marketplace} storeName={name} />
        )}
        <StoreMenu
          store={store}
          storeName={name}
          marketplaceLabel={marketplaceLabel}
          actions={actions}
        />
      </div>
    </li>
  );
}

/** A syncing store whose last refresh failed comes first, then the healthy ones, then the rest. */
function listRank(store: StoreWithActivity) {
  const health = storeHealth(store);
  if (health === "attention") {
    return 0;
  }
  return health === "connected" ? 1 : 2;
}

/** Stores that sync lead the list; the ones waiting on a reconnect settle at the bottom. */
function byConnectedFirst(stores: StoreWithActivity[]) {
  return stores.toSorted((left, right) => listRank(left) - listRank(right));
}

/** Stores as one grouped list, with the 30-day figures lined up in columns. */
export function StoreList({
  stores,
  labels,
  suppliers,
  onDisconnect,
  onChangeSupplier,
}: {
  stores: StoreWithActivity[];
  labels: Map<string, string>;
  suppliers: Map<string, StoreSupplierLabel>;
  onDisconnect: (store: StoreWithActivity) => void;
  onChangeSupplier: (store: StoreWithActivity) => void;
}) {
  return (
    <div className="space-y-2">
      <div
        aria-hidden="true"
        className={`hidden gap-x-4 px-5 text-footnote text-muted-foreground md:grid ${ROW_COLUMNS}`}
      >
        <span>Lojas · {stores.length}</span>
        <span className="text-right">Publicações</span>
        <span className="text-right">Vendas</span>
        <span className="text-right">Receita</span>
      </div>
      <GroupedList>
        {byConnectedFirst(stores).map((store) => (
          <StoreRow
            key={store.id}
            store={store}
            marketplaceLabel={labels.get(store.marketplace) ?? store.marketplace}
            supplier={store.supplierId === null ? undefined : suppliers.get(store.supplierId)}
            actions={{
              onDisconnect: () => onDisconnect(store),
              onChangeSupplier: () => onChangeSupplier(store),
            }}
          />
        ))}
      </GroupedList>
    </div>
  );
}
