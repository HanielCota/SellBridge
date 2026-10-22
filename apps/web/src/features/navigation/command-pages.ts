import {
  UserCircleIcon,
  ChartLineUpIcon,
  SquaresFourIcon,
  MegaphoneIcon,
  ReceiptIcon,
  StorefrontIcon,
  WalletIcon,
  PlugsConnectedIcon,
  ChatCircleTextIcon,
  type Icon,
} from "@phosphor-icons/react";
import type { LinkProps } from "@tanstack/react-router";

/** The pages the search offers, with the words people type to find them. */
export interface PageCommand {
  label: string;
  to: NonNullable<LinkProps["to"]>;
  icon: Icon;
  keywords: string;
}

export const PAGE_COMMANDS: PageCommand[] = [
  {
    label: "Meu cadastro",
    to: "/onboarding",
    icon: UserCircleIcon,
    keywords: "onboarding dados cpf editar fornecedor",
  },
  {
    label: "Visão geral",
    to: "/dashboard",
    icon: ChartLineUpIcon,
    keywords: "painel vendas lucro",
  },
  {
    label: "Catálogo",
    to: "/catalogo",
    icon: SquaresFourIcon,
    keywords: "produtos fornecedores publicar",
  },
  { label: "Publicações", to: "/publicacoes", icon: MegaphoneIcon, keywords: "anúncios" },
  { label: "Pedidos", to: "/pedidos", icon: ReceiptIcon, keywords: "vendas envio etiqueta" },
  { label: "Lojas", to: "/lojas", icon: StorefrontIcon, keywords: "marketplace conectar" },
  { label: "Financeiro", to: "/financeiro", icon: WalletIcon, keywords: "pedidos lucro csv" },
  {
    label: "Integrações",
    to: "/integracoes",
    icon: PlugsConnectedIcon,
    keywords: "api chave token webhook erp desenvolvedor",
  },
  { label: "Meu perfil", to: "/perfil", icon: UserCircleIcon, keywords: "foto conta" },
  { label: "Ajuda e suporte", to: "/suporte", icon: ChatCircleTextIcon, keywords: "chamado ajuda" },
];
