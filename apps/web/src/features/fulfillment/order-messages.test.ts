import { describe, expect, it } from "vitest";
import { splitShipmentEvents, type ShipmentEventRecord } from "./order-messages";

function event(
  input: Omit<ShipmentEventRecord, "createdAt"> & { minute: number },
): ShipmentEventRecord {
  const { minute, ...rest } = input;
  return { ...rest, createdAt: new Date(Date.UTC(2026, 9, 22, 12, minute)) };
}

const EVENTS: ShipmentEventRecord[] = [
  event({ id: "1", status: "forwarded", actor: "Revendedor", note: "", minute: 0 }),
  event({
    id: "2",
    status: "forwarded",
    actor: "Fornecedor",
    note: "A cor azul acabou, posso mandar a preta?",
    minute: 1,
  }),
  event({
    id: "3",
    status: "forwarded",
    actor: "Revendedor",
    note: "Pode sim, obrigado.",
    minute: 2,
  }),
  event({ id: "4", status: "accepted", actor: "Fornecedor", note: "Aceito", minute: 3 }),
  event({ id: "5", status: "accepted", actor: "Mercado Livre", note: "Rastreio", minute: 4 }),
  event({ id: "6", status: "accepted", actor: "Fornecedor", note: "   ", minute: 5 }),
];

function authors(reader: "reseller" | "supplier"): string[] {
  return splitShipmentEvents(EVENTS, reader).messages.map((message) => message.author);
}

describe("splitShipmentEvents", () => {
  it("treats a note that keeps the status as a message, oldest first", () => {
    const { messages } = splitShipmentEvents(EVENTS, "reseller");
    expect(messages.map((message) => message.text)).toEqual([
      "A cor azul acabou, posso mandar a preta?",
      "Pode sim, obrigado.",
    ]);
  });

  it("names the authors from the reader's side", () => {
    expect(authors("reseller")).toEqual(["Fornecedor", "Você"]);
    expect(authors("supplier")).toEqual(["Você", "Revendedor"]);
  });

  it("keeps step changes, system notes and empty notes out of the conversation", () => {
    const { steps } = splitShipmentEvents(EVENTS, "reseller");
    expect(steps.map((step) => step.id)).toEqual(["1", "4", "5", "6"]);
  });

  it("never shows the same event in both places", () => {
    const { messages, steps } = splitShipmentEvents(EVENTS, "supplier");
    const ids = [...messages.map((message) => message.id), ...steps.map((step) => step.id)];
    expect(ids.toSorted()).toEqual(EVENTS.map((item) => item.id).toSorted());
  });

  it("orders events written in the same instant as they were stored", () => {
    const sameTime = [
      event({ id: "a", status: "forwarded", actor: "Revendedor", note: "", minute: 0 }),
      event({ id: "b", status: "forwarded", actor: "Fornecedor", note: "primeira", minute: 1 }),
      event({ id: "c", status: "forwarded", actor: "Revendedor", note: "segunda", minute: 1 }),
    ];
    const { messages } = splitShipmentEvents(sameTime, "reseller");
    expect(messages.map((message) => message.id)).toEqual(["b", "c"]);
  });

  it("has nothing to show for a shipment without events", () => {
    expect(splitShipmentEvents([], "reseller")).toEqual({ messages: [], steps: [] });
  });
});
