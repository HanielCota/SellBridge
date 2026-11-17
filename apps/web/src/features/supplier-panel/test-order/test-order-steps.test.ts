import { describe, expect, it } from "vitest";
import {
  testOrderAwaitsPosting,
  testOrderNextAction,
  testOrderTimeline,
  type TestOrderDates,
} from "./test-order-steps";

const CREATED = new Date("2026-11-17T12:00:00Z");
const ACCEPTED = new Date("2026-11-17T12:05:00Z");

function dates(overrides: Partial<TestOrderDates> = {}): TestOrderDates {
  return {
    createdAt: CREATED,
    acceptedAt: null,
    labelPrintedAt: null,
    pickedAt: null,
    shippedAt: null,
    deliveredAt: null,
    ...overrides,
  };
}

describe("testOrderTimeline", () => {
  it("lists every step in order with the date it was reached", () => {
    const timeline = testOrderTimeline(dates({ acceptedAt: ACCEPTED }));

    expect(timeline).toEqual([
      { step: "received", label: "Recebido", at: CREATED },
      { step: "accepted", label: "Aceito", at: ACCEPTED },
      { step: "label_printed", label: "Etiqueta impressa", at: null },
      { step: "picked", label: "Separado", at: null },
      { step: "shipped", label: "Enviado", at: null },
      { step: "delivered", label: "Entregue", at: null },
    ]);
  });
});

describe("testOrderNextAction", () => {
  it("offers the next step's button while the order moves", () => {
    expect(testOrderNextAction("received")).toBe("Aceitar pedido");
    expect(testOrderNextAction("accepted")).toBe("Imprimir etiqueta de teste");
    expect(testOrderNextAction("shipped")).toBe("Marcar como entregue");
  });

  it("offers nothing once delivered", () => {
    expect(testOrderNextAction("delivered")).toBeNull();
  });
});

describe("testOrderAwaitsPosting", () => {
  it.each(["received", "accepted", "label_printed", "picked"] as const)(
    "shows the posting deadline while %s",
    (step) => {
      expect(testOrderAwaitsPosting(step)).toBe(true);
    },
  );

  it.each(["shipped", "delivered"] as const)("hides the posting deadline once %s", (step) => {
    expect(testOrderAwaitsPosting(step)).toBe(false);
  });
});
