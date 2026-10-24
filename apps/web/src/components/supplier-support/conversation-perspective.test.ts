import type { TicketEventView } from "@sellbridge/database/repositories";
import { describe, expect, it } from "vitest";
import { describeConversationEvent } from "./conversation-perspective";

function statusEvent(change: Partial<TicketEventView>): TicketEventView {
  return {
    id: 1,
    type: "status_changed",
    automatic: false,
    actorName: "Ana Souza",
    isSelfAssignment: false,
    fromValue: "answered",
    toValue: "closed",
    createdAt: new Date("2026-10-20T12:00:00Z"),
    ...change,
  };
}

describe("describeConversationEvent", () => {
  it("tells a close, an automatic close and a reopen without naming anyone", () => {
    expect(describeConversationEvent(statusEvent({}))).toBe("Conversa marcada como resolvida");
    expect(describeConversationEvent(statusEvent({ automatic: true }))).toBe(
      "Conversa encerrada automaticamente por falta de retorno",
    );
    expect(describeConversationEvent(statusEvent({ fromValue: "closed", toValue: "open" }))).toBe(
      "Conversa reaberta",
    );
  });

  it("leaves out the back-and-forth every message already shows", () => {
    expect(
      describeConversationEvent(statusEvent({ fromValue: "open", toValue: "answered" })),
    ).toBeNull();
    expect(
      describeConversationEvent(statusEvent({ type: "order_linked", toValue: "123" })),
    ).toBeNull();
  });
});
