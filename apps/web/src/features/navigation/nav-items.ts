import type { StaffPermission } from "@sellbridge/shared/staff-access";
import type { LinkProps } from "@tanstack/react-router";

/** Counters shown next to a tab when something there needs attention. */
export type NavBadge =
  | "storeMessages"
  | "ordersToAccept"
  | "failedListings"
  | "openTickets"
  | "parcelAlerts"
  | "productReviews"
  | "staffParcelAlerts"
  | "supportReplies";

export interface NavItem {
  label: string;
  to: NonNullable<LinkProps["to"]>;
  badge?: NavBadge;
  /** Other sections that live under this tab (e.g. supplier pages under Catálogo). */
  also?: string[];
  /** Team tabs only show to roles allowed to use them. */
  permission?: StaffPermission;
  /** Active only on this exact path (a home tab whose sections are tabs of their own). */
  exact?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Visão geral", to: "/dashboard" },
  { label: "Catálogo", to: "/catalogo", also: ["/fornecedores"] },
  { label: "Publicações", to: "/publicacoes", badge: "failedListings" },
  { label: "Pedidos", to: "/pedidos", badge: "parcelAlerts" },
  { label: "Lojas", to: "/lojas" },
  { label: "Financeiro", to: "/financeiro" },
];

/**
 * The supplier profile's tabs, in the order of the day (item 38): the overview, the orders, the
 * products (the spreadsheet import is a button there), then what is opened now and then.
 */
export const SUPPLIER_NAV_ITEMS: NavItem[] = [
  { label: "Início", to: "/fornecedor/painel", exact: true },
  { label: "Pedidos", to: "/fornecedor/painel/pedidos", badge: "ordersToAccept" },
  { label: "Mensagens", to: "/suporte/revendedores", badge: "storeMessages" },
  { label: "Produtos", to: "/fornecedor/painel/produtos", also: ["/fornecedor/painel/importar"] },
  { label: "Desempenho", to: "/fornecedor/painel/desempenho" },
  { label: "Marca", to: "/fornecedor/painel/marca" },
];

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { label: "Produtos", to: "/admin/products", permission: "customers.manage" },
  { label: "Clientes", to: "/admin/clientes", permission: "customers.manage" },
  {
    label: "Fornecedores",
    to: "/admin/fornecedores",
    badge: "productReviews",
    permission: "customers.manage",
  },
  // Review comments sit next to the suppliers they talk about, for moderation (admin, supervisor).
  { label: "Avaliações", to: "/admin/avaliacoes", permission: "reviews.moderate" },
  // Every customer's parcels, late and problem ones counted: "cadê meu pedido?" starts here.
  {
    label: "Envios",
    to: "/admin/envios",
    badge: "staffParcelAlerts",
    permission: "shipments.view",
  },
  {
    label: "Chamados",
    to: "/admin/chamados",
    badge: "openTickets",
    permission: "support.answer",
  },
  { label: "Equipe", to: "/admin/equipe", permission: "customers.manage" },
];

/**
 * On phones the support button leaves the crowded header and lives in the menu sheet instead
 * (from `sm` up it sits next to the bell).
 */
export const SUPPORT_NAV_ITEM: NavItem = {
  label: "Suporte",
  to: "/suporte",
  badge: "supportReplies",
};

export const BADGE_DESCRIPTIONS: Record<NavBadge, (count: number) => string> = {
  failedListings: (count) =>
    `${count} ${count === 1 ? "publicação com erro" : "publicações com erro"}`,
  openTickets: (count) => `${count} ${count === 1 ? "chamado aberto" : "chamados abertos"}`,
  parcelAlerts: (count) =>
    `${count} ${count === 1 ? "pacote atrasado ou com problema" : "pacotes atrasados ou com problema"}`,
  staffParcelAlerts: (count) =>
    `${count} ${count === 1 ? "envio atrasado ou com problema" : "envios atrasados ou com problema"}`,
  productReviews: (count) =>
    `${count} ${count === 1 ? "produto esperando análise" : "produtos esperando análise"}`,
  storeMessages: (count) =>
    `${count} ${count === 1 ? "conversa de loja sem ler" : "conversas de lojas sem ler"}`,
  supportReplies: (count) =>
    `${count} ${count === 1 ? "chamado com resposta nova" : "chamados com resposta nova"}`,
  ordersToAccept: (count) =>
    `${count} ${count === 1 ? "pedido esperando aceite" : "pedidos esperando aceite"}`,
};

export function isActivePath(pathname: string, target: string): boolean {
  return pathname === target || pathname.startsWith(`${target}/`);
}

function matchesItem(item: NavItem, pathname: string): boolean {
  if (item.exact === true) {
    return pathname === item.to;
  }
  return [item.to, ...(item.also ?? [])].some((target) => isActivePath(pathname, target));
}

/**
 * The one tab to light for this page. "Suporte" also matches "/suporte/revendedores", so the
 * longest matching route wins and the supplier's "Mensagens" tab is lit alone.
 */
export function activeNavItemTo(items: readonly NavItem[], pathname: string): NavItem["to"] | null {
  const matches = items.filter((item) => matchesItem(item, pathname));
  const mostSpecific = matches.toSorted((first, second) => second.to.length - first.to.length)[0];
  if (mostSpecific === undefined) {
    return null;
  }
  return mostSpecific.to;
}
