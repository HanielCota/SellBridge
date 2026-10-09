import type { ListingStoreStatus } from "@sellbridge/database/repositories";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { ListingStatusBadge } from "@/components/data/status-badge";

const SIMULATED_SUFFIX = /\s*\(loja simulada\)\s*$/i;

/** Shop name without the "(loja simulada)" noise; the simulated badge says it once. */
export function displayStoreName(name: string): string {
  return name.replace(SIMULATED_SUFFIX, "");
}

function attemptsNote(store: ListingStoreStatus): string | null {
  // One successful attempt is the normal case and says nothing.
  if (store.attempts <= 1 && store.status !== "error") {
    return null;
  }
  return `${store.attempts} ${store.attempts === 1 ? "tentativa" : "tentativas"}`;
}

function StoreStatusLine({ store }: { store: ListingStoreStatus }) {
  const name = displayStoreName(store.storeName);
  const note = attemptsNote(store);
  return (
    <li className="space-y-0.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="max-w-44 truncate text-sm" title={store.storeName}>
          {name}
        </span>
        {store.marketplace === "mock" ? (
          <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            Simulada
          </span>
        ) : null}
        <ListingStatusBadge status={store.status} />
        {store.externalUrl ? (
          <a
            href={store.externalUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`Ver anúncio em ${name}`}
            title="Ver no marketplace"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowSquareOutIcon className="size-3.5" aria-hidden="true" />
          </a>
        ) : null}
      </div>
      {store.errorReason ? <p className="text-xs text-destructive">{store.errorReason}</p> : null}
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </li>
  );
}

/** Status of one product in every store it was sent to. */
export function StoreStatuses({ stores }: { stores: ListingStoreStatus[] }) {
  return (
    <ul className="min-w-56 space-y-2">
      {stores.map((store) => (
        <StoreStatusLine key={store.id} store={store} />
      ))}
    </ul>
  );
}
