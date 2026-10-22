import type { SupplierFlagReason } from "./supplier-flags.ts";

/**
 * The 5 "Regras de ouro" every supplier agrees to, like YouTube's community guidelines: each flag
 * the team applies breaks one of them. Shown to the supplier in the panel and to the team next to
 * the flag form, so both read the same words.
 */
export const SUPPLIER_GOLDEN_RULE_IDS = [
  "ship_on_time",
  "ship_what_was_sold",
  "keep_catalog_current",
  "answer_within_one_business_day",
  "talk_only_inside_sellbridge",
] as const;
export type SupplierGoldenRuleId = (typeof SUPPLIER_GOLDEN_RULE_IDS)[number];

export interface SupplierGoldenRule {
  id: SupplierGoldenRuleId;
  /** 1 to 5, as the supplier reads it ("Regra 2"). */
  number: number;
  title: string;
  summary: string;
  example: string;
}

export const SUPPLIER_GOLDEN_RULES: readonly SupplierGoldenRule[] = [
  {
    id: "ship_on_time",
    number: 1,
    title: "Despache dentro do prazo",
    summary: "Todo pedido sai para entrega dentro do prazo de envio que você informou.",
    example: "Prazo de 1 dia útil e venda na segunda: o pacote é postado até terça.",
  },
  {
    id: "ship_what_was_sold",
    number: 2,
    title: "Envie exatamente o produto anunciado",
    summary: "Mesmo modelo, cor e tamanho do anúncio, com fotos e dados certos, e bem embalado.",
    example: "Venderam a camiseta azul M: vai a azul M, protegida para não chegar amassada.",
  },
  {
    id: "keep_catalog_current",
    number: 3,
    title: "Mantenha estoque e preço sempre em dia",
    summary: "Só fica à venda o que você tem para entregar, pelo preço certo.",
    example: "Acabou o tênis 38? Zere o estoque dele no mesmo dia.",
  },
  {
    id: "answer_within_one_business_day",
    number: 4,
    title: "Responda em até 1 dia útil",
    summary:
      "Chamados do suporte e perguntas dos revendedores têm resposta até o próximo dia útil.",
    example: "Chamado aberto na sexta à tarde: responda até segunda.",
  },
  {
    id: "talk_only_inside_sellbridge",
    number: 5,
    title: "Converse só pela SellBridge",
    summary: "Nunca passe nem peça telefone, WhatsApp, e-mail ou redes sociais.",
    example: "Pediram seu WhatsApp? Responda pelo chamado, sem passar o número.",
  },
];

/**
 * The rule each flag reason breaks. "Outro" has none: the team explains it in the note. A late
 * dispatch has no reason of its own yet and goes as "Outro" with the rule named in the note.
 */
export const SUPPLIER_FLAG_REASON_RULES: Readonly<
  Record<SupplierFlagReason, SupplierGoldenRuleId | null>
> = {
  product_listing_error: "ship_what_was_sold",
  order_error: "ship_what_was_sold",
  stale_catalog: "keep_catalog_current",
  slow_support: "answer_within_one_business_day",
  contact_attempt: "talk_only_inside_sellbridge",
  other: null,
};

export function goldenRuleForReason(reason: SupplierFlagReason): SupplierGoldenRule | null {
  const ruleId = SUPPLIER_FLAG_REASON_RULES[reason];
  if (ruleId === null) {
    return null;
  }
  return SUPPLIER_GOLDEN_RULES.find((rule) => rule.id === ruleId) ?? null;
}

/** "Regra 2: Envie exatamente o produto anunciado". */
export function goldenRuleLabel(rule: SupplierGoldenRule): string {
  return `Regra ${rule.number}: ${rule.title}`;
}
