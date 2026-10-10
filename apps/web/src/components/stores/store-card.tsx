import { formatCents } from "@sellbridge/shared/money";
import { Link } from "@tanstack/react-router";
import { LinkBreakIcon, PlugIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { StoreStatusBadge } from "@/components/stores/store-status-badge";
import { displayStoreName } from "@/features/stores/store-name";
import { Button } from "@/components/ui/button";
import type { listStores } from "@/features/stores/stores.functions";
import { formatAbsoluteTime, formatRelativeTime } from "@/lib/relative-time";
import { MarketplaceMark } from "./marketplace-mark";

export type StoreWithActivity = Awaited<ReturnType<typeof listStores>>["stores"][number];

const compactMoney = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tracking-tight tabular-nums">{value}</dd>
    </div>
  );
}

function ConnectionProblem({ store }: { store: StoreWithActivity }) {
  if (store.status === "connected") {
    return null;
  }
  return (
    <div className="flex items-start gap-3 rounded-xl bg-destructive/10 p-3 text-sm">
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

function FailedListingsLink({ count }: { count: number }) {
  if (count === 0) {
    return null;
  }
  return (
    <Link
      to="/publicacoes"
      search={{ status: "error" }}
      className="text-xs font-medium text-destructive hover:underline"
    >
      {count} {count === 1 ? "publicação com erro" : "publicações com erro"}
    </Link>
  );
}

/** One connected store: identity, health and what it sold in the last 30 days. */
export function StoreCard({
  store,
  marketplaceLabel,
  onDisconnect,
}: {
  store: StoreWithActivity;
  marketplaceLabel: string;
  onDisconnect: () => void;
}) {
  const { activity } = store;
  return (
    <article className="surface-card flex h-full flex-col gap-5 rounded-3xl bg-card p-5">
      <header className="flex items-start gap-3">
        <MarketplaceMark marketplace={store.marketplace} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-medium" title={store.shopName}>
            {displayStoreName(store.shopName)}
          </h2>
          <p className="text-sm text-muted-foreground">{marketplaceLabel}</p>
        </div>
        <StoreStatusBadge status={store.status} />
      </header>
      <ConnectionProblem store={store} />
      <dl className="grid grid-cols-3 gap-3">
        <Stat label="Publicações" value={activity.liveListings.toLocaleString("pt-BR")} />
        <Stat label="Vendas (30 dias)" value={activity.orders.toLocaleString("pt-BR")} />
        <Stat label="Receita (30 dias)" value={compactMoney.format(activity.revenueCents / 100)} />
      </dl>
      <span className="sr-only">Receita exata: {formatCents(activity.revenueCents)}</span>
      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground">
            Conectada{" "}
            <time
              dateTime={store.connectedAt.toISOString()}
              title={formatAbsoluteTime(store.connectedAt)}
              suppressHydrationWarning
            >
              {formatRelativeTime(store.connectedAt)}
            </time>
          </p>
          <FailedListingsLink count={activity.failedListings} />
        </div>
        <Button variant="ghost" size="sm" onClick={onDisconnect}>
          <LinkBreakIcon aria-hidden="true" />
          Desconectar
        </Button>
      </footer>
    </article>
  );
}
