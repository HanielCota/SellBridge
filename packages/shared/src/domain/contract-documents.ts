import type { ProfileKind } from "./profile-kind.ts";

/**
 * The contracts a profile signs before using SellBridge: one for suppliers, one for sellers.
 * Every word the screens show lives here, so a new text only replaces this file and
 * bumps `version`; the signature records keep the hash of the exact text each person accepted.
 */

/** One line of the summary: the person ticks each one before signing. */
export interface ContractSummaryItem {
  /** Stable id stored with the signature: change it when the line's meaning changes. */
  readonly id: string;
  readonly text: string;
}

export interface ContractSection {
  readonly title: string;
  readonly paragraphs: readonly string[];
}

export interface ContractDocument {
  readonly kind: ProfileKind;
  /** Bumped on every change of the text: a new version asks everyone to sign again. */
  readonly version: string;
  /** Day the version takes effect (UTC, ISO 8601): the 30 days of who already uses it start here at the earliest. */
  readonly effectiveAt: string;
  readonly title: string;
  /** Where the full text is published. */
  readonly path: "/contrato/fornecedor" | "/contrato/vendedor";
  readonly summary: readonly ContractSummaryItem[];
  readonly sections: readonly ContractSection[];
}

/** Days who already used SellBridge has to sign once the switch is on or a new version starts. */
export const CONTRACT_SIGNING_GRACE_DAYS = 30;

const SUPPLIER_CONTRACT: ContractDocument = {
  kind: "supplier",
  version: "2026-11-21-provisorio",
  effectiveAt: "2026-11-21T00:00:00Z",
  title: "Contrato de fornecedor",
  path: "/contrato/fornecedor",
  summary: [
    {
      id: "intermediation",
      text: "A SellBridge só faz a intermediação: não vende, não guarda estoque e não recebe o dinheiro dos pedidos.",
    },
    {
      id: "company-only",
      text: "Só empresas com CNPJ de ME, EPP ou maior podem ser fornecedoras. MEI e pessoa física não.",
    },
    {
      id: "platform-fee",
      text: "A SellBridge fica com 4% do preço do produto, sem contar o frete, separados no momento do pagamento.",
    },
    {
      id: "shipping-deadline",
      text: "Envio dentro do prazo de cada marketplace. Pedido atrasado tem multa de 20% sobre o valor do pedido.",
    },
    {
      id: "no-poaching",
      text: "Proibido chamar revendedores para vender fora da SellBridge: multa de R$ 10 mil por revendedor, por até 12 meses depois de sair.",
    },
    {
      id: "exit-notice",
      text: "Para sair, aviso com 30 dias de antecedência e saldos com os revendedores zerados.",
    },
    {
      id: "jurisdiction",
      text: "Qualquer disputa é resolvida no foro de Divinópolis (MG).",
    },
  ],
  sections: [
    {
      title: "1. Quem somos e o que fazemos",
      paragraphs: [
        "A SellBridge é uma plataforma que liga fornecedores a revendedores que anunciam em marketplaces. A SellBridge só faz a intermediação: não vende, não guarda estoque e não recebe o dinheiro dos pedidos.",
      ],
    },
    {
      title: "2. Quem pode ser fornecedor",
      paragraphs: [
        "Só empresas com CNPJ enquadradas como ME, EPP ou maior. MEI e pessoa física não podem ser fornecedores.",
        "O fornecedor mantém os dados da empresa atualizados e corrige qualquer dado pedido pela SellBridge em até 72 horas.",
      ],
    },
    {
      title: "3. Pagamento e taxa",
      paragraphs: [
        "O revendedor paga o pedido direto ao fornecedor. A SellBridge recebe 4% do preço do produto, sem contar o frete, separados automaticamente no momento do pagamento.",
        "Pedido pago com crédito comercial não gera a taxa de 4%.",
      ],
    },
    {
      title: "4. Prazos e penalidades",
      paragraphs: [
        "O fornecedor envia cada pedido dentro do prazo e do horário de corte de cada marketplace e informa o código de rastreio e a nota fiscal.",
        "Pedido enviado com atraso tem multa de 20% sobre o valor do pedido. Atrasos, cancelamentos e defeitos acima dos limites podem levar a advertência, suspensão ou exclusão.",
      ],
    },
    {
      title: "5. Relação com os revendedores",
      paragraphs: [
        "Toda conversa com revendedores acontece dentro da plataforma. É proibido chamar revendedores para negociar fora da SellBridge, sob multa de R$ 10 mil por revendedor, por até 12 meses depois de sair.",
      ],
    },
    {
      title: "6. Saída",
      paragraphs: [
        "O fornecedor pode sair avisando com 30 dias de antecedência, com os pedidos entregues, os saldos com os revendedores zerados e as taxas pagas.",
      ],
    },
    {
      title: "7. Assinatura e prova",
      paragraphs: [
        "A assinatura é eletrônica, confirmada por um código enviado ao e-mail da conta. A SellBridge guarda a prova da assinatura (data, hora, fuso, endereço de internet, aparelho, navegador, versão e código de integridade deste texto) pelo prazo da lei.",
      ],
    },
    {
      title: "8. Foro",
      paragraphs: ["Fica eleito o foro da comarca de Divinópolis (MG)."],
    },
  ],
};

const SELLER_CONTRACT: ContractDocument = {
  kind: "seller",
  version: "2026-11-21-provisorio",
  effectiveAt: "2026-11-21T00:00:00Z",
  title: "Contrato de vendedor",
  path: "/contrato/vendedor",
  summary: [
    {
      id: "intermediation",
      text: "A SellBridge só faz a intermediação: não vende, não guarda estoque e não recebe o dinheiro dos pedidos.",
    },
    {
      id: "who-can-sell",
      text: "Pode vender quem tem CPF e é maior de 18 anos, ou quem tem CNPJ.",
    },
    {
      id: "pays-supplier",
      text: "Você paga cada pedido direto ao fornecedor.",
    },
    {
      id: "plan-refund",
      text: "O plano não tem devolução do valor, exceto nos 7 dias de arrependimento depois da contratação.",
    },
    {
      id: "marketplace-addresses",
      text: "Você é responsável por deixar os endereços certos no marketplace: o principal é o seu; coleta e devolução são do fornecedor.",
    },
    {
      id: "jurisdiction",
      text: "Qualquer disputa é resolvida no foro de Divinópolis (MG).",
    },
  ],
  sections: [
    {
      title: "1. Quem somos e o que fazemos",
      paragraphs: [
        "A SellBridge é uma plataforma que liga revendedores a fornecedores para vender em marketplaces. A SellBridge só faz a intermediação: não vende, não guarda estoque e não recebe o dinheiro dos pedidos.",
      ],
    },
    {
      title: "2. Quem pode vender",
      paragraphs: [
        "Pessoa física com CPF e maior de 18 anos, ou empresa com CNPJ. O nome oficial (o da nota fiscal) fica separado do nome fantasia da loja.",
      ],
    },
    {
      title: "3. Pedidos e pagamento",
      paragraphs: [
        "O revendedor paga cada pedido direto ao fornecedor, pela plataforma.",
        "O plano de assinatura não tem devolução do valor, exceto nos 7 dias de arrependimento depois da contratação.",
      ],
    },
    {
      title: "4. Endereços no marketplace",
      paragraphs: [
        "O revendedor é responsável por manter os endereços corretos em cada marketplace: o endereço principal é o dele; os de coleta e de devolução são os do fornecedor.",
      ],
    },
    {
      title: "5. Assinatura e prova",
      paragraphs: [
        "A assinatura é eletrônica, confirmada por um código enviado ao e-mail da conta. A SellBridge guarda a prova da assinatura (data, hora, fuso, endereço de internet, aparelho, navegador, versão e código de integridade deste texto) pelo prazo da lei.",
      ],
    },
    {
      title: "6. Foro",
      paragraphs: ["Fica eleito o foro da comarca de Divinópolis (MG)."],
    },
  ],
};

const CONTRACTS: Readonly<Record<ProfileKind, ContractDocument>> = {
  supplier: SUPPLIER_CONTRACT,
  seller: SELLER_CONTRACT,
};

/** The contract in force for this kind of profile. */
export function contractFor(kind: ProfileKind): ContractDocument {
  return CONTRACTS[kind];
}
