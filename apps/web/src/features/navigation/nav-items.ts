import type { StaffPermission } from "@sellbridge/shared/staff-access";
import type { LinkProps } from "@tanstack/react-router";

/** Counters shown next to a tab when something there needs attention. */
export type NavBadge = "failedListings" | "openTickets" | "productReviews" | "supportReplies";

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
  { label: "Meus produtos", to: "/products" },
  { label: "Catálogo", to: "/catalogo", also: ["/fornecedores"] },
  { label: "Publicações", to: "/publicacoes", badge: "failedListings" },
  { label: "Pedidos", to: "/pedidos" },
  { label: "Lojas", to: "/lojas" },
  { label: "Financeiro", to: "/financeiro" },
];

/** The supplier profile's tabs: its panel replaces every seller tab. */
export const SUPPLIER_NAV_ITEMS: NavItem[] = [
  { label: "Início", to: "/fornecedor/painel", exact: true },
  { label: "Pedidos", to: "/fornecedor/painel/pedidos" },
  { label: "Meus produtos", to: "/fornecedor/painel/produtos" },
  { label: "Importar produtos", to: "/fornecedor/painel/importar" },
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
  productReviews: (count) =>
    `${count} ${count === 1 ? "produto esperando análise" : "produtos esperando análise"}`,
  supportReplies: (count) =>
    `${count} ${count === 1 ? "chamado com resposta nova" : "chamados com resposta nova"}`,
};

export function isActivePath(pathname: string, target: string): boolean {
  return pathname === target || pathname.startsWith(`${target}/`);
}
