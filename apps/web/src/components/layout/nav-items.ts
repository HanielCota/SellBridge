import type { LinkProps } from "@tanstack/react-router";
import {
  LayoutDashboard,
  MapPin,
  Megaphone,
  Plug,
  Store,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  to: NonNullable<LinkProps["to"]>;
  icon: LucideIcon;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Visão geral",
    items: [{ label: "Dashboard", to: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Catálogo",
    items: [
      { label: "Fornecedores", to: "/fornecedores", icon: Store },
      { label: "Publicações", to: "/publicacoes", icon: Megaphone },
    ],
  },
  {
    label: "Vendas",
    items: [
      { label: "Lojas conectadas", to: "/lojas", icon: Plug },
      { label: "Financeiro", to: "/financeiro", icon: Wallet },
    ],
  },
  {
    label: "Conta",
    items: [{ label: "Minha região", to: "/onboarding", icon: MapPin }],
  },
];

export const ADMIN_NAV_SECTION: NavSection | null = null;
