import type { ListingStoreStatus } from "@sellbridge/database/repositories";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { LISTING_STATUS_LABELS } from "@sellbridge/shared/schemas";
import { cn } from "@/lib/utils";

const SIMULATED_SUFFIX = /\s*\(loja simulada\)\s*$/i;

/** Shop name without the "(loja simulada)" noise; the chip's tooltip and screen-reader text say it once. */
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

type ListingStatus = ListingStoreStatus["status"];

const DOT_CLASSES: Record<ListingStatus, string> = {
  pending: "bg-sky-500",
  publishing: "bg-sky-500 animate-pulse motion-reduce:animate-none",
  published: "bg-emerald-500",
  paused: "bg-muted-foreground/50",
  error: "bg-red-500",
};

/**
 * One store as a chip: status dot and shop name. "Publicado" is the normal state, so only the
 * exceptions spell out their status; screen readers and the tooltip always get the full reading.
 */
function StoreChip({ store }: { store: ListingStoreStatus }) {
  const name = displayStoreName(store.storeName);
  const label = LISTING_STATUS_LABELS[store.status];
  const simulated = store.marketplace === "mock";
  const description = `${name}${simulated ? " (loja simulada)" : ""}: ${label}`;
  const chipClass = cn(
    "inline-flex h-7 max-w-full items-center gap-1.5 rounded-full bg-muted pr-3 pl-2.5 text-xs font-medium whitespace-nowrap",
    store.status === "error" && "bg-destructive/10 text-destructive",
  );
  const content = (
    <>
      <span
        aria-hidden="true"
        className={cn("size-1.5 shrink-0 rounded-full", DOT_CLASSES[store.status])}
      />
      <span className="truncate">{name}</span>
      {simulated ? <span className="sr-only"> (loja simulada)</span> : null}
      {store.status === "published" ? (
        <span className="sr-only">: {label}</span>
      ) : (
        <span className="text-muted-foreground">· {label}</span>
      )}
      {store.externalUrl ? (
        <ArrowSquareOutIcon
          className="size-3.5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      ) : null}
    </>
  );
  return store.externalUrl ? (
    <a
      href={store.externalUrl}
      target="_blank"
      rel="noreferrer"
      title={`${description} · ver no marketplace`}
      className={cn(chipClass, "transition-colors hover:bg-foreground/10")}
    >
      {content}
    </a>
  ) : (
    <span title={description} className={chipClass}>
      {content}
    </span>
  );
}

/** Status of one product in every store it was sent to. */
export function StoreStatuses({ stores }: { stores: ListingStoreStatus[] }) {
  const notes = stores.flatMap((store) => {
    const text = store.errorReason ?? attemptsNote(store);
    return text ? [{ id: store.id, text, error: store.errorReason !== null }] : [];
  });
  return (
    <div className="min-w-0 space-y-1.5 md:min-w-56">
      <ul className="flex flex-wrap gap-1.5">
        {stores.map((store) => (
          <li key={store.id} className="max-w-full">
            <StoreChip store={store} />
          </li>
        ))}
      </ul>
      {notes.map((note) => (
        <p
          key={note.id}
          className={cn(
            "text-xs whitespace-normal",
            note.error ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {note.text}
        </p>
      ))}
    </div>
  );
}
