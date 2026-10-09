import type { NotificationEvent, NotificationKind } from "@sellbridge/database/repositories";
import { formatCents } from "@sellbridge/shared/money";
import { displayStoreName } from "@/features/stores/store-name";
import type { NotificationFeed } from "./notification-feed";

export type { NotificationKind };

/** One row of the notification bell. */
export interface AppNotification {
  /** Stable per event, so the list keys do not shuffle between polls. */
  id: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  at: Date;
  /** Where the notification leads. */
  href: string;
}

export interface PresentedNotifications {
  items: AppNotification[];
  unread: number;
  seenAt: Date | null;
}

/** Wording and destination of each kind of event, in the reseller's language. */
export function presentNotification(event: NotificationEvent): AppNotification {
  const base = { kind: event.kind, at: event.at };
  // The switch narrows each kind; what is left after it is a support reply.
  switch (event.kind) {
    case "sale":
      return {
        ...base,
        id: `sale:${event.entityId}`,
        title: `Nova venda de ${formatCents(event.totalCents)}`,
        detail: `${event.externalOrderId} · ${displayStoreName(event.storeName)}`,
        href: `/financeiro?query=${encodeURIComponent(event.externalOrderId)}`,
      };
    case "listing_error":
      return {
        ...base,
        id: `listing:${event.entityId}:${event.at.getTime()}`,
        title: `Publicação recusada: ${event.listingTitle}`,
        detail: event.errorReason ?? "Erro ao publicar",
        href: "/publicacoes?status=error",
      };
    case "store_problem":
      return {
        ...base,
        id: `store:${event.entityId}:${event.at.getTime()}`,
        title: `${displayStoreName(event.storeName)} precisa ser reconectada`,
        detail: "Pedidos e estoque estão parados nesta loja.",
        href: "/lojas",
      };
  }
  return {
    ...base,
    id: `ticket:${event.entityId}:${event.at.getTime()}`,
    title: "O suporte respondeu",
    detail: event.subject,
    href: `/suporte/${event.entityId}`,
  };
}

export function presentNotificationFeed(feed: NotificationFeed): PresentedNotifications {
  return {
    items: feed.events.map((event) => presentNotification(event)),
    unread: feed.unread,
    seenAt: feed.seenAt,
  };
}
