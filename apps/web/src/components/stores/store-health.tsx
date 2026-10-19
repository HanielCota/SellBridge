import { type ReactNode, useId } from "react";
import type { StoreStatus } from "@sellbridge/shared/schemas";
import { describeStoreAccess, type StoreAccessTone } from "@sellbridge/shared/store-attention";
import { TONE_DOT_CLASSES } from "@/components/data/tone-status";
import { DropdownMenuGroup } from "@/components/ui/dropdown-menu";
import { formatAbsoluteTime, formatRelativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";
import { TERM_HINTS } from "@/components/icons/action-icons";
import { HintedText } from "@/components/ui/hint";

/** What the store health rows read from a store: its access and the last signs of life. */
export interface StoreHealthFacts {
  status: StoreStatus;
  lastError: string | null;
  lastSyncedAt: Date | null;
  lastWebhookAt: Date | null;
}

const NEVER = "Ainda não houve";

const ACCESS_TEXT: Record<StoreAccessTone, string> = {
  success: "text-foreground",
  warning: "text-amber-700 dark:text-amber-400",
  danger: "text-destructive",
  muted: "text-muted-foreground",
};

/** A past moment as "há 12 minutos", with the exact time one hover away. */
function LastTime({ date }: { date: Date | null }) {
  if (date === null) {
    return <span className="whitespace-nowrap text-muted-foreground">{NEVER}</span>;
  }
  return (
    <time
      dateTime={date.toISOString()}
      title={formatAbsoluteTime(date)}
      className="whitespace-nowrap"
      suppressHydrationWarning
    >
      {formatRelativeTime(date)}
    </time>
  );
}

function HealthRow({
  label,
  hint,
  children,
}: {
  label: string;
  /** Legend on the row's name, for a term the reseller may not know. */
  hint?: string;
  children: ReactNode;
}) {
  return (
    // The label gives way first: a narrow row wraps it rather than squeezing the value.
    <div className="flex items-baseline justify-between gap-3">
      <dt className="min-w-0 flex-1 text-muted-foreground">
        {hint ? (
          <HintedText label={hint} className="underline decoration-dotted underline-offset-4">
            {label}
          </HintedText>
        ) : (
          label
        )}
      </dt>
      <dd className="max-w-[60%] shrink-0 text-right">{children}</dd>
    </div>
  );
}

/**
 * The store's health in three lines: when listings last synced, when the marketplace last sent
 * an event, and whether the access is fine. The token renews by itself, so its expiry is not
 * shown; only whether it needs the seller.
 */
export function StoreHealthRows({
  store,
  className,
}: {
  store: StoreHealthFacts;
  className?: string;
}) {
  const access = describeStoreAccess(store);
  return (
    <dl className={cn("space-y-1 text-xs", className)}>
      <HealthRow label="Última sincronização" hint={TERM_HINTS.lastSync}>
        <LastTime date={store.lastSyncedAt} />
      </HealthRow>
      <HealthRow label="Último aviso de pedido" hint={TERM_HINTS.lastOrderPing}>
        <LastTime date={store.lastWebhookAt} />
      </HealthRow>
      <HealthRow label="Acesso">
        <span className={cn("inline-flex items-baseline gap-1.5", ACCESS_TEXT[access.tone])}>
          <span
            aria-hidden="true"
            className={cn(
              "size-1.5 shrink-0 translate-y-[-1px] self-center rounded-full",
              TONE_DOT_CLASSES[access.tone],
            )}
          />
          {access.label}
        </span>
      </HealthRow>
    </dl>
  );
}

/**
 * The health rows as a titled group inside the store's menu. A menu only walks its items, so
 * screen readers also get the same facts from the menu button (`storeHealthSummary`).
 */
export function StoreHealthSection({ store }: { store: StoreHealthFacts }) {
  const titleId = useId();
  return (
    <DropdownMenuGroup aria-labelledby={titleId} className="px-2.5 pt-1 pb-2.5">
      <p id={titleId} className="mb-1.5 text-xs font-semibold text-foreground">
        Saúde da loja
      </p>
      <StoreHealthRows store={store} />
    </DropdownMenuGroup>
  );
}

function lastTimeText(date: Date | null): string {
  if (date === null) {
    return NEVER.toLowerCase();
  }
  return formatRelativeTime(date);
}

/** The health facts as one sentence, for the store menu button's accessible description. */
export function storeHealthSummary(store: StoreHealthFacts): string {
  const access = describeStoreAccess(store);
  return `Saúde da loja: última sincronização ${lastTimeText(store.lastSyncedAt)}; último aviso de pedido ${lastTimeText(store.lastWebhookAt)}; acesso ${access.label.toLowerCase()}.`;
}

/**
 * The same facts as one wrapping sentence, for rows too narrow for label and value side by side
 * (the customer's stores on the admin page).
 */
export function StoreHealthLine({ store }: { store: StoreHealthFacts }) {
  const access = describeStoreAccess(store);
  return (
    <p className="text-footnote text-muted-foreground">
      Sincronização: <LastTime date={store.lastSyncedAt} /> · Aviso de pedido:{" "}
      <LastTime date={store.lastWebhookAt} /> · Acesso:{" "}
      <span className={ACCESS_TEXT[access.tone]}>{access.label}</span>
    </p>
  );
}
