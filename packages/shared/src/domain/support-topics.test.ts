import { describe, expect, it } from "vitest";
import { PROFILE_KINDS, type ProfileKind } from "./profile-kind.ts";
import {
  SUPPORT_TOPICS,
  findSupportTopic,
  minimumDescriptionLength,
  planSupportTicket,
  supportTicketSubject,
} from "./support-topics.ts";
import type { TicketCategory } from "./ticket-rules.ts";

const LONG_ENOUGH = "Esperava R$ 1.250,00 no dia 15/10 e não caiu na conta.";

function planFor(input: {
  kind: ProfileKind;
  category: TicketCategory;
  situationId?: string;
  description?: string;
}) {
  return planSupportTicket({
    kind: input.kind,
    category: input.category,
    situationId: input.situationId,
    about: undefined,
    description: input.description ?? LONG_ENOUGH,
  });
}

describe("support topics", () => {
  it.each(PROFILE_KINDS)("keeps situation ids unique inside each %s topic", (kind) => {
    for (const topic of SUPPORT_TOPICS[kind]) {
      const ids = topic.situations.map((situation) => situation.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it.each(PROFILE_KINDS)("offers each category once and ends with a way out for %s", (kind) => {
    const categories = SUPPORT_TOPICS[kind].map((topic) => topic.category);
    expect(new Set(categories).size).toBe(categories.length);
    expect(categories.at(-1)).toBe("other");
  });

  it("keeps store connection out of the supplier topics", () => {
    expect(findSupportTopic("supplier", "store")).toBeUndefined();
    expect(findSupportTopic("seller", "store")).toBeDefined();
  });

  it("asks for a longer description when there is no situation to go on", () => {
    const other = findSupportTopic("seller", "other");
    const order = findSupportTopic("seller", "order");
    expect(other && minimumDescriptionLength(other)).toBe(40);
    expect(order && minimumDescriptionLength(order)).toBe(20);
  });
});

describe("planSupportTicket", () => {
  it("derives a high priority from a missing payout", () => {
    const plan = planSupportTicket({
      kind: "seller",
      category: "payment",
      situationId: "payout-missing",
      about: undefined,
      description: LONG_ENOUGH,
    });
    expect(plan.priority).toBe("high");
    expect(plan.subject).toBe(`O dinheiro de uma venda não caiu: ${LONG_ENOUGH}`);
  });

  it("names the ticket after the item it was opened from", () => {
    const plan = planSupportTicket({
      kind: "seller",
      category: "order",
      situationId: "order-late",
      about: "Pedido 2000012345",
      description: LONG_ENOUGH,
    });
    expect(plan).toEqual({ priority: "normal", subject: "O pedido atrasou: Pedido 2000012345" });
  });

  it("opens an other-topic ticket without a situation", () => {
    const plan = planSupportTicket({
      kind: "supplier",
      category: "other",
      situationId: undefined,
      about: undefined,
      description: "Quero entender como funciona a coleta dos pedidos na minha cidade.",
    });
    expect(plan.subject.startsWith("Outra coisa: Quero entender")).toBe(true);
  });

  it("refuses a topic the profile does not have", () => {
    expect(() => planFor({ kind: "supplier", category: "store", situationId: "x" })).toThrow(
      expect.objectContaining({ code: "VALIDATION" }),
    );
  });

  it("refuses a topic with situations when none of them was picked", () => {
    expect(() => planFor({ kind: "seller", category: "payment", situationId: "made-up" })).toThrow(
      expect.objectContaining({ code: "VALIDATION" }),
    );
  });

  it("refuses a description shorter than the topic asks for", () => {
    expect(() =>
      planFor({ kind: "seller", category: "other", description: "Preciso de ajuda com uma coisa" }),
    ).toThrow("Conte um pouco mais");
  });
});

describe("supportTicketSubject", () => {
  it("keeps the subject on one line and within 120 characters", () => {
    const subject = supportTicketSubject({
      heading: "O rastreio parou",
      about: undefined,
      description: `Parado desde 12/10\n\n${"muito texto ".repeat(30)}`,
    });
    expect(subject).not.toContain("\n");
    expect(subject.length).toBeLessThanOrEqual(120);
    expect(subject.endsWith("…")).toBe(true);
  });
});
