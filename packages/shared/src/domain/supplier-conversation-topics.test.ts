import { describe, expect, it } from "vitest";
import { OTHER_SITUATION_ID } from "./support-topics.ts";
import {
  CONVERSATION_STATUS_LABELS,
  findSupplierConversationTopic,
  planSupplierConversation,
  SUPPLIER_CONVERSATION_TOPIC_IDS,
  SUPPLIER_CONVERSATION_TOPIC_LABELS,
  SUPPLIER_CONVERSATION_TOPICS,
} from "./supplier-conversation-topics.ts";

const LONG_ENOUGH = "O comprador recebeu o tamanho 38 em vez do 40 que pediu.";

describe("supplier conversation topics", () => {
  it("offers every topic id once, in the order of the enum, ending with Outro assunto", () => {
    expect(SUPPLIER_CONVERSATION_TOPICS.map((topic) => topic.id)).toEqual([
      ...SUPPLIER_CONVERSATION_TOPIC_IDS,
    ]);
    expect(SUPPLIER_CONVERSATION_TOPICS.at(-1)?.label).toBe("Outro assunto");
  });

  it("keeps the short labels in step with the topics", () => {
    for (const topic of SUPPLIER_CONVERSATION_TOPICS) {
      expect(SUPPLIER_CONVERSATION_TOPIC_LABELS[topic.id]).toBe(topic.label);
    }
  });

  it("ends every topic with situations with Outro problema and keeps ids unique", () => {
    for (const topic of SUPPLIER_CONVERSATION_TOPICS.filter((item) => item.situations.length)) {
      const ids = topic.situations.map((item) => item.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.at(-1)).toBe(OTHER_SITUATION_ID);
    }
  });

  it("lists the order situations the reseller asks about most", () => {
    const labels = findSupplierConversationTopic("order")?.situations.map((item) => item.label);
    expect(labels).toEqual([
      "O pedido está atrasado",
      "Chegou errado ou avariado",
      "O pedido não chegou",
      "Outro problema",
    ]);
  });

  it("points at the order picker only for order and return topics", () => {
    const suggesting = SUPPLIER_CONVERSATION_TOPICS.filter((topic) => topic.suggestsOrder);
    expect(suggesting.map((topic) => topic.id)).toEqual(["order", "return"]);
  });

  it("finds nothing for an unknown or missing id", () => {
    expect(findSupplierConversationTopic("payment")).toBeUndefined();
    expect(findSupplierConversationTopic(undefined)).toBeUndefined();
  });
});

describe("planSupplierConversation", () => {
  it("names the conversation after the situation, without the reseller's text", () => {
    const plan = planSupplierConversation({
      topicId: "order",
      situationId: "order-late",
      description: LONG_ENOUGH,
    });
    expect(plan).toEqual({
      category: "order",
      priority: "normal",
      subject: "O pedido está atrasado",
    });
  });

  it("names it after the topic for Outro problema and for topics without situations", () => {
    const other = planSupplierConversation({
      topicId: "return",
      situationId: OTHER_SITUATION_ID,
      description: `${LONG_ENOUGH} E ainda quer saber o prazo.`,
    });
    expect(other.subject).toBe("Troca ou devolução");
    const product = planSupplierConversation({
      topicId: "product",
      situationId: undefined,
      description: `${LONG_ENOUGH} Qual é a forma?`,
    });
    expect(product).toMatchObject({ category: "listing", subject: "Dúvida sobre um produto" });
  });

  it("requires a situation when the topic has them", () => {
    expect(() =>
      planSupplierConversation({
        topicId: "order",
        situationId: undefined,
        description: LONG_ENOUGH,
      }),
    ).toThrow(/situação/);
  });

  it("refuses a description too short for the supplier to act on", () => {
    expect(() =>
      planSupplierConversation({
        topicId: "order",
        situationId: "order-late",
        description: "Atrasou",
      }),
    ).toThrow(/Conte um pouco mais/);
  });
});

describe("conversation status labels", () => {
  it("tells each side who the conversation waits for", () => {
    expect(CONVERSATION_STATUS_LABELS.reseller.open).toBe("Aguardando fornecedor");
    expect(CONVERSATION_STATUS_LABELS.supplier.open).toBe("Aguardando sua resposta");
    expect(CONVERSATION_STATUS_LABELS.reseller.closed).toBe("Resolvido");
  });
});
