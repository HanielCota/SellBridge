import type { AppNotification, NotificationKind } from "./notification-presenter";

export type NotificationTab = "all" | "sales" | "problems" | "messages";

/** Tabs of the bell panel, grouped by what the reseller has to do about each event. */
export const NOTIFICATION_TABS: readonly {
  value: NotificationTab;
  label: string;
  /** What the tab shows when it has nothing; null on "all", which keeps the panel's own copy. */
  empty: string | null;
}[] = [
  { value: "all", label: "Todas", empty: null },
  {
    value: "sales",
    label: "Vendas",
    empty: "Nenhuma venda nova. Quando alguém comprar, aparece aqui.",
  },
  {
    value: "problems",
    label: "Problemas",
    empty: "Nenhum problema por aqui. Tudo publicado e conectado.",
  },
  {
    value: "messages",
    label: "Mensagens",
    empty: "Nenhuma resposta do suporte ou avaliação esperando por você.",
  },
];

const TAB_OF_KIND: Record<NotificationKind, Exclude<NotificationTab, "all">> = {
  sale: "sales",
  listing_error: "problems",
  store_problem: "problems",
  support_reply: "messages",
  review_pending: "messages",
};

export function belongsToTab(notification: AppNotification, tab: NotificationTab): boolean {
  if (tab === "all") {
    return true;
  }
  return TAB_OF_KIND[notification.kind] === tab;
}
