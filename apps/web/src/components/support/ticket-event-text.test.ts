import type { TicketEventView } from "@sellbridge/database/repositories";
import { describe, expect, it } from "vitest";
import { describeCustomerEvent } from "./ticket-event-text";

function event(patch: Partial<TicketEventView>): TicketEventView {
  return {
    id: 1,
    type: "status_changed",
    automatic: false,
    actorName: "Marina Souza",
    isSelfAssignment: false,
    fromValue: null,
    toValue: null,
    createdAt: new Date("2026-10-12T12:00:00Z"),
    ...patch,
  };
}

describe("describeCustomerEvent", () => {
  it("tells closing and reopening, but not the back-and-forth of each message", () => {
    expect(describeCustomerEvent(event({ fromValue: "answered", toValue: "closed" }))).toBe(
      "Marina Souza encerrou o chamado",
    );
    expect(describeCustomerEvent(event({ fromValue: "closed", toValue: "open" }))).toBe(
      "Chamado reaberto",
    );
    expect(describeCustomerEvent(event({ fromValue: "open", toValue: "answered" }))).toBeNull();
    expect(describeCustomerEvent(event({ automatic: true, toValue: "closed" }))).toBe(
      "Chamado encerrado automaticamente por falta de retorno",
    );
  });

  it("names who handles the ticket and what was linked", () => {
    expect(describeCustomerEvent(event({ type: "assigned", toValue: "Carla Mendes" }))).toBe(
      "Carla Mendes está cuidando do seu chamado",
    );
    expect(describeCustomerEvent(event({ type: "order_linked", toValue: "ML-8812" }))).toBe(
      "Marina Souza vinculou o pedido #ML-8812",
    );
    expect(describeCustomerEvent(event({ type: "follower_added", toValue: "João" }))).toBe(
      "Marina Souza adicionou João ao chamado",
    );
  });
});
