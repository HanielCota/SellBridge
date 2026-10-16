import type { StaffPermission } from "@sellbridge/shared/staff-access";
import type { LinkProps } from "@tanstack/react-router";

/** Counters shown next to a tab when something there needs attention. */
export type NavBadge = "failedListings" | "openTickets" | "supportReplies";

export interface NavItem {
  label: string;
  to: NonNullable<LinkProps["to"]>;
  badge?: NavBadge;
  /** Other sections that live under this tab (e.g. supplier pages under Catálogo). */
  also?: string[];
  /** Team tabs only show to roles allowed to use them. */
  permission?: StaffPermission;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Visão geral", to: "/dashboard" },
  { label: "Catálogo", to: "/catalogo", also: ["/fornecedores"] },
  { label: "Publicações", to: "/publicacoes", badge: "failedListings" },
  { label: "Pedidos", to: "/pedidos" },
  { label: "Lojas", to: "/lojas" },
  { label: "Financeiro", to: "/financeiro" },
];

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { label: "Clientes", to: "/admin/clientes", permission: "customers.manage" },
  { label: "Fornecedores", to: "/admin/fornecedores", permission: "customers.manage" },
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
  supportReplies: (count) =>
    `${count} ${count === 1 ? "chamado com resposta nova" : "chamados com resposta nova"}`,
};

export function isActivePath(pathname: string, target: string): boolean {
  return pathname === target || pathname.startsWith(`${target}/`);
}
