import {
  BellIcon,
  ChatCircleTextIcon,
  type Icon,
  ClockIcon,
  PackageIcon,
  PlugsIcon,
  ShoppingBagIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
  StarIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Popover, Tabs } from "radix-ui";
import { useState } from "react";
import { toast } from "sonner";
import { ProductVisual } from "@/components/catalog/product-visual";
import { SmartDate } from "@/components/data/smart-date";
import type {
  AppNotification,
  NotificationKind,
} from "@/features/notifications/notification-presenter";
import {
  clearNotificationsFn,
  markNotificationsSeenFn,
} from "@/features/notifications/notifications.functions";
import { notificationsQueryOptions } from "@/features/notifications/notifications.queries";
import { errorMessage } from "@/lib/errors";
import { useNotificationSound } from "@/features/notifications/notification-sound-preference";
import {
  belongsToTab,
  NOTIFICATION_TABS,
  type NotificationTab,
} from "@/features/notifications/notification-tabs";
import { useNotificationChime } from "@/features/notifications/use-notification-chime";
import { Hint } from "@/components/ui/hint";

/** Problems that wait for the reseller, in the warning tone of `ToneStatus`. */
const WARNING_TINT = "bg-amber-500/15 text-amber-700 dark:text-amber-400";

const KIND_STYLES: Record<NotificationKind, { icon: Icon; className: string }> = {
  sale: { icon: ShoppingBagIcon, className: "bg-brand/15 text-brand-text" },
  listing_error: {
    icon: WarningCircleIcon,
    className: "bg-red-500/15 text-red-600 dark:text-red-400",
  },
  store_problem: {
    icon: PlugsIcon,
    className: WARNING_TINT,
  },
  stock_shortage: {
    icon: PackageIcon,
    className: WARNING_TINT,
  },
  shipment_cancelled: {
    icon: PackageIcon,
    className: WARNING_TINT,
  },
  shipment_late: {
    icon: ClockIcon,
    className: WARNING_TINT,
  },
  listing_unavailable: {
    icon: PackageIcon,
    className: WARNING_TINT,
  },
  support_reply: {
    icon: ChatCircleTextIcon,
    className: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  },
  review_pending: {
    icon: StarIcon,
    className: WARNING_TINT,
  },
};

/** A sale shows what it sold, with the sale's own icon as a badge; everything else, its icon. */
function NotificationMark({ notification }: { notification: AppNotification }) {
  const style = KIND_STYLES[notification.kind];
  if (!notification.product) {
    return (
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full",
          style.className,
        )}
      >
        <style.icon className="size-4" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="relative size-9 shrink-0">
      <span className="block size-full overflow-hidden rounded-xl">
        <ProductVisual
          imageUrl={notification.product.imageUrl}
          title={notification.product.title}
          categoryName={notification.product.categoryName}
          compact
          className="size-full"
        />
      </span>
      <span
        className={cn(
          "absolute -right-1 -bottom-1 flex size-[1.125rem] items-center justify-center rounded-full ring-2 ring-popover",
          style.className,
        )}
      >
        <style.icon className="size-2.5" weight="bold" aria-hidden="true" />
      </span>
    </span>
  );
}

function NotificationRow({
  notification,
  isNew,
  onNavigate,
}: {
  notification: AppNotification;
  isNew: boolean;
  onNavigate: () => void;
}) {
  return (
    <li>
      <Link
        to={notification.href}
        onClick={onNavigate}
        className="flex gap-3 rounded-xl p-3 transition-[background-color,box-shadow] duration-100 outline-none hover:row-lift focus-visible:row-lift"
      >
        <NotificationMark notification={notification} />
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="line-clamp-2 text-sm font-medium wrap-anywhere">
              {notification.title}
            </span>
            {isNew ? (
              <>
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                <span className="sr-only">Novo</span>
              </>
            ) : null}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {notification.detail}
          </span>
          <SmartDate date={notification.at} className="text-xs text-muted-foreground" />
        </span>
      </Link>
    </li>
  );
}

function useMarkSeen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => markNotificationsSeenFn(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

function useClearNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => clearNotificationsFn(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    onError: (error) => toast.error(errorMessage(error)),
  });
}

function SoundToggle() {
  const { soundOn, setSoundOn } = useNotificationSound();
  const SpeakerIcon = soundOn ? SpeakerHighIcon : SpeakerSlashIcon;
  return (
    <Hint label={soundOn ? "Som ligado" : "Som desligado"}>
      <button
        type="button"
        aria-pressed={soundOn}
        aria-label="Som dos avisos"
        onClick={() => setSoundOn(!soundOn)}
        className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/30"
      >
        <SpeakerIcon className="size-4" aria-hidden="true" />
      </button>
    </Hint>
  );
}

function PanelHeader({ canClear }: { canClear: boolean }) {
  const clear = useClearNotifications();
  return (
    <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-1">
      <p className="text-sm font-semibold">Avisos</p>
      <div className="-mr-1.5 flex items-center gap-1">
        <SoundToggle />
        {canClear ? (
          <button
            type="button"
            onClick={() => clear.mutate()}
            disabled={clear.isPending}
            className="rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/30 disabled:opacity-50"
          >
            Limpar tudo
          </button>
        ) : null}
      </div>
    </div>
  );
}

// Each tab wears the icon its notifications already use in the list.
const TAB_ICONS: Record<NotificationTab, Icon> = {
  all: BellIcon,
  sales: KIND_STYLES.sale.icon,
  problems: KIND_STYLES.listing_error.icon,
  messages: KIND_STYLES.support_reply.icon,
};

const EVERYTHING_EMPTY =
  "Nada novo por aqui. Vendas, erros de publicação e respostas do suporte aparecem nesta lista.";

function TabTrigger({
  value,
  label,
  hasNew,
  active,
}: {
  value: NotificationTab;
  label: string;
  hasNew: boolean;
  active: boolean;
}) {
  const TabIcon = TAB_ICONS[value];
  return (
    <Tabs.Trigger
      value={value}
      className="relative flex flex-col items-center gap-1 rounded-lg pt-2 pb-2.5 text-xs font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/30 data-[state=active]:text-foreground"
    >
      <TabIcon className="size-5" weight={active ? "fill" : "regular"} aria-hidden="true" />
      {label}
      {hasNew ? (
        <>
          <span
            className="absolute top-1.5 left-[calc(50%+0.5rem)] size-2 rounded-full bg-brand ring-2 ring-popover"
            aria-hidden="true"
          />
          <span className="sr-only">, com novidades</span>
        </>
      ) : null}
    </Tabs.Trigger>
  );
}

function NotificationList({
  items,
  empty,
  isNew,
  onNavigate,
}: {
  items: AppNotification[];
  empty: string;
  isNew: (notification: AppNotification) => boolean;
  onNavigate: () => void;
}) {
  if (items.length === 0) {
    return <p className="px-3 py-8 text-center text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="max-h-[min(28rem,60svh)] overflow-y-auto">
      {items.map((notification) => (
        <NotificationRow
          key={notification.id}
          notification={notification}
          isNew={isNew(notification)}
          onNavigate={onNavigate}
        />
      ))}
    </ul>
  );
}

function isNotificationTab(value: string): value is NotificationTab {
  return NOTIFICATION_TABS.some((candidate) => candidate.value === value);
}

function NotificationTabs({
  tab,
  onTabChange,
  items,
  isNew,
  onNavigate,
}: {
  tab: NotificationTab;
  onTabChange: (tab: NotificationTab) => void;
  items: AppNotification[];
  isNew: (notification: AppNotification) => boolean;
  onNavigate: () => void;
}) {
  const tabIndex = NOTIFICATION_TABS.findIndex((candidate) => candidate.value === tab);
  return (
    <Tabs.Root
      value={tab}
      onValueChange={(next) => {
        if (isNotificationTab(next)) {
          onTabChange(next);
        }
      }}
    >
      <Tabs.List
        aria-label="Tipos de aviso"
        className="relative mx-1 mb-1.5 grid grid-cols-4 border-b border-border"
      >
        {NOTIFICATION_TABS.map((candidate) => (
          <TabTrigger
            key={candidate.value}
            value={candidate.value}
            label={candidate.label}
            active={candidate.value === tab}
            hasNew={
              candidate.value !== "all" &&
              items.some((item) => belongsToTab(item, candidate.value) && isNew(item))
            }
          />
        ))}
        <span
          className="absolute -bottom-px left-0 h-0.5 w-1/4 rounded-full bg-brand transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
          style={{ transform: `translateX(${tabIndex * 100}%)` }}
          aria-hidden="true"
        />
      </Tabs.List>
      {NOTIFICATION_TABS.map((candidate) => (
        <Tabs.Content key={candidate.value} value={candidate.value} className="outline-none">
          <NotificationList
            items={items.filter((item) => belongsToTab(item, candidate.value))}
            empty={candidate.empty ?? EVERYTHING_EMPTY}
            isNew={isNew}
            onNavigate={onNavigate}
          />
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}

/** Bell with the unread count; opening it lists recent events and marks them as seen. */
export function NotificationBell() {
  const query = useQuery(notificationsQueryOptions());
  const markSeen = useMarkSeen();
  useNotificationChime(query.data?.items);
  const [open, setOpen] = useState(false);
  // The tab stays where the reseller left it the next time the panel opens.
  const [tab, setTab] = useState<NotificationTab>("all");
  // What was unread when the panel opened stays highlighted while it is open.
  const [seenBefore, setSeenBefore] = useState<Date | null>(null);
  const unread = query.data?.unread ?? 0;
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setSeenBefore(query.data?.seenAt ?? null);
      if (unread > 0) {
        markSeen.mutate();
      }
    }
  }
  const items = query.data?.items ?? [];
  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger
        aria-label={unread > 0 ? `Avisos: ${unread} novos` : "Avisos"}
        className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/30"
      >
        <BellIcon className="size-5" aria-hidden="true" />
        {unread > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-caption font-semibold text-primary-foreground tabular-nums">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={10}
          tabIndex={-1}
          // Focus lands on the panel, not on its first button: the sound toggle's hint would
          // open on focus and take the first Escape, leaving the panel open.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            if (event.currentTarget instanceof HTMLElement) {
              event.currentTarget.focus();
            }
          }}
          className="z-50 w-[min(24rem,calc(100vw-2rem))] rounded-2xl bg-popover p-2 text-popover-foreground shadow-xl shadow-black/15 ring-1 ring-border outline-none"
        >
          <PanelHeader canClear={items.length > 0} />
          <NotificationTabs
            tab={tab}
            onTabChange={setTab}
            items={items}
            isNew={(notification) =>
              seenBefore === null || new Date(notification.at) > new Date(seenBefore)
            }
            onNavigate={() => setOpen(false)}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
