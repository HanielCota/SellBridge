import { validationError } from "../runtime/errors.ts";
import {
  findSupportSituation,
  isOpenEnded,
  minimumDescriptionLength,
  otherSituation,
  type SupportSituation,
  type SupportSituationPriority,
} from "./support-topics.ts";
import type { TicketCategory, TicketStatus } from "./ticket-rules.ts";

/*
 * What a reseller can ask their supplier about, in the same guided shape as the website support
 * topics: a topic, then what is going on, then a description. Every customer-facing word of the
 * flow lives here, so copy changes never touch the components.
 */

/** Mirrors the `supplier_conversation_topic` enum. Stable ids: never rename one. */
export const SUPPLIER_CONVERSATION_TOPIC_IDS = [
  "order",
  "return",
  "stock_price",
  "product",
  "other",
] as const;
export type SupplierConversationTopicId = (typeof SUPPLIER_CONVERSATION_TOPIC_IDS)[number];

export interface SupplierConversationTopic {
  id: SupplierConversationTopicId;
  /** The ticket category the team's filters read; the topic itself is kept apart. */
  category: TicketCategory;
  label: string;
  legend: string;
  /** Empty when the form goes straight to the description. */
  situations: readonly SupportSituation[];
  /** Used when the topic has no situations. */
  question: string;
  example: string;
  /** Whether the form points at the order picker: the supplier finds the case by the order. */
  suggestsOrder: boolean;
}

function situation(
  id: string,
  copy: { label: string; legend: string; question: string; example: string },
  attachmentTip: string | null = null,
): SupportSituation {
  return { id, ...copy, priority: "normal", attachmentTip, notice: null };
}

const BASE_TOPICS: readonly SupplierConversationTopic[] = [
  {
    id: "order",
    category: "order",
    label: "Pedido",
    legend: "Atrasou, chegou errado ou não chegou",
    question: "O que aconteceu com o pedido?",
    example: "Exemplo: o comprador recebeu o tamanho 38 em vez do 40.",
    suggestsOrder: true,
    situations: [
      situation("order-late", {
        label: "O pedido está atrasado",
        legend: "Passou do prazo e não foi enviado",
        question: "Desde quando o pedido espera o envio?",
        example: "Exemplo: o pedido foi pago na segunda e ainda não tem rastreio.",
      }),
      situation(
        "order-wrong-or-damaged",
        {
          label: "Chegou errado ou avariado",
          legend: "Produto trocado, quebrado ou faltando peça",
          question: "O que chegou de errado?",
          example: "Exemplo: a caixa chegou amassada e o tênis veio com a sola solta.",
        },
        "Fotos do produto e da embalagem.",
      ),
      situation("order-not-arrived", {
        label: "O pedido não chegou",
        legend: "O rastreio parou ou diz entregue sem ter chegado",
        question: "O que o rastreio mostra?",
        example: "Exemplo: o rastreio diz entregue, mas o comprador não recebeu.",
      }),
    ],
  },
  {
    id: "return",
    category: "order",
    label: "Troca ou devolução",
    legend: "O comprador quer trocar ou devolver",
    question: "O que o comprador pediu?",
    example: "Exemplo: o comprador quer trocar o 40 pelo 41.",
    suggestsOrder: true,
    situations: [
      situation("exchange", {
        label: "O comprador quer trocar",
        legend: "Outro tamanho, outra cor ou outro modelo",
        question: "Pelo que o comprador quer trocar?",
        example: "Exemplo: quer trocar o 40 pelo 41, na mesma cor.",
      }),
      situation(
        "give-back",
        {
          label: "O comprador quer devolver",
          legend: "Desistiu da compra ou o produto veio com defeito",
          question: "Por que o comprador quer devolver?",
          example: "Exemplo: o produto veio com defeito no zíper.",
        },
        "Fotos do defeito, se houver.",
      ),
    ],
  },
  {
    id: "stock_price",
    category: "listing",
    label: "Estoque ou preço",
    legend: "Produto sem estoque ou preço diferente",
    question: "O que aconteceu com o estoque ou o preço?",
    example: "Exemplo: o tênis preto 40 aparece sem estoque desde ontem.",
    suggestsOrder: false,
    situations: [
      situation("out-of-stock", {
        label: "Produto sem estoque",
        legend: "Quero saber quando volta",
        question: "Qual produto está sem estoque?",
        example: "Exemplo: o tênis preto 40. Ele volta esta semana?",
      }),
      situation("price-changed", {
        label: "O preço mudou",
        legend: "O custo ficou diferente do combinado",
        question: "Qual produto mudou de preço?",
        example: "Exemplo: o custo da bolsa caramelo passou de R$ 80 para R$ 95.",
      }),
    ],
  },
  {
    id: "product",
    category: "listing",
    label: "Dúvida sobre um produto",
    legend: "Medidas, material ou como usar",
    question: "Qual é a sua dúvida sobre o produto?",
    example: "Exemplo: o tênis de corrida tem a forma pequena ou normal?",
    suggestsOrder: false,
    situations: [],
  },
  {
    id: "other",
    category: "other",
    label: "Outro assunto",
    legend: "Nenhuma das opções acima",
    question: "Sobre o que você quer falar com o fornecedor?",
    example: "Exemplo: quero saber se vocês enviam aos sábados.",
    suggestsOrder: false,
    situations: [],
  },
];

function withOtherSituation(topic: SupplierConversationTopic): SupplierConversationTopic {
  if (topic.situations.length === 0) {
    return topic;
  }
  return { ...topic, situations: [...topic.situations, otherSituation(topic)] };
}

export const SUPPLIER_CONVERSATION_TOPICS: readonly SupplierConversationTopic[] =
  BASE_TOPICS.map(withOtherSituation);

export function findSupplierConversationTopic(
  id: string | undefined,
): SupplierConversationTopic | undefined {
  if (id === undefined) {
    return undefined;
  }
  return SUPPLIER_CONVERSATION_TOPICS.find((topic) => topic.id === id);
}

export const SUPPLIER_CONVERSATION_TOPIC_LABELS: Readonly<
  Record<SupplierConversationTopicId, string>
> = {
  order: "Pedido",
  return: "Troca ou devolução",
  stock_price: "Estoque ou preço",
  product: "Dúvida sobre um produto",
  other: "Outro assunto",
};

const SUBJECT_MAX = 120;

export interface SupplierConversationPlan {
  category: TicketCategory;
  priority: SupportSituationPriority;
  /** The heading only: it goes into e-mails, which never carry what the reseller wrote. */
  subject: string;
}

/**
 * Checks what the form sent against the topics: a topic with situations needs one of them, and
 * the description needs the same minimum length as a website ticket.
 */
export function planSupplierConversation(input: {
  topicId: SupplierConversationTopicId;
  situationId: string | undefined;
  description: string;
}): SupplierConversationPlan {
  const topic = findSupplierConversationTopic(input.topicId);
  if (topic === undefined) {
    throw validationError(
      `O assunto "${input.topicId}" não existe; escolha um dos assuntos da tela`,
    );
  }
  const picked = findSupportSituation(topic, input.situationId);
  if (topic.situations.length > 0 && picked === undefined) {
    throw validationError(
      `A situação "${input.situationId ?? ""}" não existe no assunto ${topic.id}; escolha o que está acontecendo`,
    );
  }
  if (input.description.trim().length < minimumDescriptionLength(picked)) {
    throw validationError("Conte um pouco mais para o fornecedor entender o caso");
  }
  const heading = picked === undefined || isOpenEnded(picked) ? topic.label : picked.label;
  return {
    category: topic.category,
    priority: picked?.priority ?? "normal",
    subject: heading.slice(0, SUBJECT_MAX),
  };
}

/** Who reads a conversation: the store that asked, or the supplier it was sent to. */
export type ConversationSide = "reseller" | "supplier";

/**
 * The website ticket states in this channel's words. "Open" waits for the supplier: the reseller
 * reads "Aguardando fornecedor", the supplier "Aguardando sua resposta".
 */
export const CONVERSATION_STATUS_LABELS: Readonly<
  Record<ConversationSide, Readonly<Record<TicketStatus, string>>>
> = {
  reseller: { open: "Aguardando fornecedor", answered: "Respondido", closed: "Resolvido" },
  supplier: { open: "Aguardando sua resposta", answered: "Respondido", closed: "Resolvido" },
};
