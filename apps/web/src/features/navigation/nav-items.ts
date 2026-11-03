import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import type { StaffPermission } from "@sellbridge/shared/staff-access";
import type { LinkProps } from "@tanstack/react-router";

/** Counters shown next to a tab when something there needs attention. */
export type NavBadge =
  | "storeMessages"
  | "supplierOrders"
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
  /** The sidebar heading the item sits under; items without one open the list. */
  group?: string;
}

/** Items in a row under the same sidebar heading; `heading` is null for the ungrouped start. */
export interface NavGroup {
  heading: string | null;
  items: NavItem[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Visão geral", to: "/dashboard" },
  { label: "Catálogo", to: "/catalogo", also: ["/fornecedores"], group: "Vender" },
  { label: "Publicações", to: "/publicacoes", badge: "failedListings", group: "Vender" },
  { label: "Pedidos", to: "/pedidos", badge: "parcelAlerts", group: "Vender" },
  { label: "Financeiro", to: "/financeiro", group: "Dinheiro" },
  { label: "Lojas", to: "/lojas", group: "Lojas" },
  // The marketplace connections sat only in the account menu, where resellers did not find them.
  { label: "Integrações", to: "/integracoes", group: "Lojas" },
];

/**
 * The supplier profile's items, in the order of the day (item 38): the overview, the orders, then
 * the catalog. The spreadsheet import is an item of its own: as a button inside Produtos, a
 * supplier looked for it in the menu and did not find it.
 */
export const SUPPLIER_NAV_ITEMS: NavItem[] = [
  { label: "Início", to: "/fornecedor/painel", exact: true },
  {
    label: "Pedidos",
    to: "/fornecedor/painel/pedidos",
    badge: "supplierOrders",
    group: "Vendas",
  },
  { label: "Vendas", to: "/fornecedor/painel/vendas", group: "Vendas" },
  { label: "Mensagens", to: "/suporte/revendedores", badge: "storeMessages", group: "Vendas" },
  { label: "Produtos", to: "/fornecedor/painel/produtos", group: "Catálogo" },
  { label: "Importar planilha", to: "/fornecedor/painel/importar", group: "Catálogo" },
  { label: "Desempenho", to: "/fornecedor/painel/desempenho", group: "Catálogo" },
  { label: "Regras de ouro", to: "/fornecedor/painel/regras", group: "Catálogo" },
];

/**
 * The team's items. Contas comes first because switching team mode on lands on the first page
 * the role may open (`teamEntryPage`), and for admins that stays the product management.
 */
export const ADMIN_NAV_ITEMS: NavItem[] = [
  {
    label: "Gestão de produtos",
    to: "/admin/products",
    permission: "customers.manage",
    group: "Contas",
  },
  { label: "Clientes", to: "/admin/clientes", permission: "customers.manage", group: "Contas" },
  {
    label: "Fornecedores",
    to: "/admin/fornecedores",
    permission: "customers.manage",
    group: "Contas",
  },
  // Only admins review products; customers.manage is an admin-only permission.
  {
    label: "Análise de produtos",
    to: "/admin/fornecedores/analise",
    badge: "productReviews",
    permission: "customers.manage",
    group: "Contas",
  },
  {
    label: "Chamados",
    to: "/admin/chamados",
    badge: "openTickets",
    permission: "support.answer",
    group: "Atendimento",
  },
  {
    label: "Desempenho do suporte",
    to: "/admin/chamados/metricas",
    permission: "support.metrics",
    group: "Atendimento",
  },
  // Every customer's parcels, late and problem ones counted: "cadê meu pedido?" starts here.
  {
    label: "Envios",
    to: "/admin/envios",
    badge: "staffParcelAlerts",
    permission: "shipments.view",
    group: "Atendimento",
  },
  // Review comments sit next to the suppliers they talk about, for moderation (admin, supervisor).
  {
    label: "Avaliações",
    to: "/admin/avaliacoes",
    permission: "reviews.moderate",
    group: "Moderação",
  },
  { label: "Equipe", to: "/admin/equipe", permission: "customers.manage", group: "Equipe" },
  { label: "Auditoria", to: "/admin/auditoria", permission: "audit.view", group: "Equipe" },
];

/** Support sits at the foot of the menu for every profile, under its own pages. */
export const SUPPORT_NAV_ITEM: NavItem = {
  label: "Suporte",
  to: "/suporte",
  badge: "supportReplies",
};

const PROFILE_PAGE_ITEM: NavItem = { label: "Meu perfil", to: "/perfil" };

/** The foot of the menu: the account's own pages, apart from the day-to-day work above. */
export const ACCOUNT_NAV_ITEMS: Readonly<Record<ProfileKind, readonly NavItem[]>> = {
  seller: [SUPPORT_NAV_ITEM, { label: "Assinatura", to: "/assinatura" }, PROFILE_PAGE_ITEM],
  supplier: [
    { label: "Marca", to: "/fornecedor/painel/marca" },
    SUPPORT_NAV_ITEM,
    PROFILE_PAGE_ITEM,
  ],
};

/** Splits the items into runs under the same heading, keeping their order. */
export function navGroups(items: readonly NavItem[]): NavGroup[] {
  const groups: NavGroup[] = [];
  for (const item of items) {
    const heading = item.group ?? null;
    const last = groups.at(-1);
    if (last !== undefined && last.heading === heading) {
      last.items.push(item);
      continue;
    }
    groups.push({ heading, items: [item] });
  }
  return groups;
}

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
  supplierOrders: (count) =>
    `${count} ${count === 1 ? "pedido para aceitar, atrasado ou com problema" : "pedidos para aceitar, atrasados ou com problema"}`,
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
