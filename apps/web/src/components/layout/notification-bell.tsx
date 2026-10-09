import type { AppNotification, NotificationKind } from "@sellbridge/database/repositories";
import {
  BellIcon,
  ChatCircleTextIcon,
  type Icon,
  PlugsIcon,
  ShoppingBagIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { Popover } from "radix-ui";
import { useState } from "react";
import { SmartDate } from "@/components/data/smart-date";
import { markNotificationsSeenFn } from "@/features/notifications/notifications.functions";
import { notificationsQueryOptions } from "@/features/notifications/notifications.queries";

const KIND_STYLES: Record<NotificationKind, { icon: Icon; className: string }> = {
  sale: { icon: ShoppingBagIcon, className: "bg-brand/15 text-brand-text" },
  listing_error: { icon: WarningCircleIcon, className: "bg-red-500/15 text-red-500" },
  store_problem: { icon: PlugsIcon, className: "bg-amber-500/15 text-amber-500" },
  support_reply: { icon: ChatCircleTextIcon, className: "bg-sky-500/15 text-sky-500" },
};

function NotificationRow({
  notification,
  isNew,
  onNavigate,
}: {
  notification: AppNotification;
  isNew: boolean;
  onNavigate: () => void;
}) {
  const style = KIND_STYLES[notification.kind];
  return (
    <li>
      <Link
        to={notification.href}
        onClick={onNavigate}
        className="flex gap-3 rounded-2xl p-3 transition-colors hover:bg-muted"
      >
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full",
            style.className,
          )}
        >
          <style.icon className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="text-sm font-medium">{notification.title}</span>
            {isNew ? (
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" aria-label="Novo" />
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

/** Bell with the unread count; opening it lists recent events and marks them as seen. */
export function NotificationBell() {
  const query = useQuery(notificationsQueryOptions());
  const markSeen = useMarkSeen();
  const [open, setOpen] = useState(false);
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
          <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-semibold text-primary-foreground tabular-nums">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={10}
          className="z-50 w-[min(24rem,calc(100vw-2rem))] rounded-3xl bg-popover p-2 text-popover-foreground shadow-2xl shadow-black/40 ring-1 ring-border outline-none"
        >
          <p className="px-3 pt-2 pb-1 text-sm font-semibold">Avisos</p>
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Nada novo por aqui. Vendas, erros de publicação e respostas do suporte aparecem neste
              lugar.
            </p>
          ) : (
            <ul className="max-h-[min(28rem,70svh)] overflow-y-auto">
              {items.map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  isNew={seenBefore === null || new Date(notification.at) > new Date(seenBefore)}
                  onNavigate={() => setOpen(false)}
                />
              ))}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
