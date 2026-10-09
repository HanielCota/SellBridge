import type { LinkProps } from "@tanstack/react-router";

/** Counters shown next to a tab when something there needs attention. */
export type NavBadge = "failedListings" | "openTickets";

export interface NavItem {
  label: string;
  to: NonNullable<LinkProps["to"]>;
  badge?: NavBadge;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Visão geral", to: "/dashboard" },
  { label: "Fornecedores", to: "/fornecedores" },
  { label: "Publicações", to: "/publicacoes", badge: "failedListings" },
  { label: "Lojas", to: "/lojas" },
  { label: "Financeiro", to: "/financeiro" },
];

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { label: "Clientes", to: "/admin/clientes" },
  { label: "Chamados", to: "/admin/chamados", badge: "openTickets" },
];

export const BADGE_DESCRIPTIONS: Record<NavBadge, (count: number) => string> = {
  failedListings: (count) =>
    `${count} ${count === 1 ? "publicação com erro" : "publicações com erro"}`,
  openTickets: (count) => `${count} ${count === 1 ? "chamado aberto" : "chamados abertos"}`,
};

export function isActivePath(pathname: string, target: string): boolean {
  return pathname === target || pathname.startsWith(`${target}/`);
}
