import type { LinkProps } from "@tanstack/react-router";
import {
  ChartLineUpIcon,
  QuestionIcon,
  ReceiptIcon,
  StorefrontIcon,
  TagIcon,
  TrayIcon,
  UsersThreeIcon,
  WarehouseIcon,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";

/** Counters shown next to an item when something there needs attention. */
export type NavBadge = "failedListings" | "answeredTickets" | "openTickets";

export interface NavItem {
  label: string;
  to: NonNullable<LinkProps["to"]>;
  icon: PhosphorIcon;
  badge?: NavBadge;
}

export interface NavSection {
  /** Sections without a label sit at the top, like a home item. */
  label: string | null;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: null,
    items: [{ label: "Visão geral", to: "/dashboard", icon: ChartLineUpIcon }],
  },
  {
    label: "Catálogo",
    items: [
      { label: "Fornecedores", to: "/fornecedores", icon: WarehouseIcon },
      { label: "Publicações", to: "/publicacoes", icon: TagIcon, badge: "failedListings" },
    ],
  },
  {
    label: "Vendas",
    items: [
      { label: "Lojas conectadas", to: "/lojas", icon: StorefrontIcon },
      { label: "Financeiro", to: "/financeiro", icon: ReceiptIcon },
    ],
  },
];

export const ADMIN_NAV_SECTION: NavSection | null = {
  label: "Administração",
  items: [
    { label: "Clientes", to: "/admin/clientes", icon: UsersThreeIcon },
    { label: "Chamados", to: "/admin/chamados", icon: TrayIcon, badge: "openTickets" },
  ],
};

/** Help lives at the bottom, next to the account, as in most desktop apps. */
export const SUPPORT_NAV_ITEM: NavItem = {
  label: "Ajuda e suporte",
  to: "/suporte",
  icon: QuestionIcon,
  badge: "answeredTickets",
};

export const BADGE_DESCRIPTIONS: Record<NavBadge, (count: number) => string> = {
  failedListings: (count) =>
    `${count} ${count === 1 ? "publicação com erro" : "publicações com erro"}`,
  answeredTickets: (count) =>
    `${count} ${count === 1 ? "resposta do suporte" : "respostas do suporte"}`,
  openTickets: (count) => `${count} ${count === 1 ? "chamado aberto" : "chamados abertos"}`,
};
