import { computeSupplierHealth } from "@sellbridge/shared/supplier-panel-health";
import { describe, expect, it } from "vitest";
import {
  againstCountLabel,
  formatDeadlineHours,
  formatDuration,
  orderOutcomeText,
  ordersTabOf,
  performanceFacts,
  seeAllLabel,
} from "./performance-format";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function metricOf(key: "accept_on_time" | "supplier_returns") {
  const health = computeSupplierHealth({ shipments: [], reviews: [], now: new Date() });
  const metric = health.metrics.find((candidate) => candidate.key === key);
  if (metric === undefined) {
    throw new Error(`missing ${key}`);
  }
  return metric;
}

describe("formatDuration", () => {
  it("reads minutes, hours and days with two units at most", () => {
    expect(formatDuration(40 * MINUTE)).toBe("40 min");
    expect(formatDuration(6 * HOUR)).toBe("6 h");
    expect(formatDuration(6 * HOUR + 40 * MINUTE)).toBe("6 h 40 min");
    expect(formatDuration(33 * HOUR + 20 * MINUTE)).toBe("1 dia e 9 h");
    expect(formatDuration(48 * HOUR)).toBe("2 dias");
  });

  it("never reads a negative time", () => {
    expect(formatDuration(-5 * MINUTE)).toBe("0 min");
  });
});

describe("formatDeadlineHours", () => {
  it("keeps one day in hours and whole days past it in days", () => {
    expect(formatDeadlineHours(24)).toBe("24 horas");
    expect(formatDeadlineHours(1)).toBe("1 hora");
    expect(formatDeadlineHours(48)).toBe("2 dias");
    expect(formatDeadlineHours(36)).toBe("36 horas");
  });
});

describe("labels", () => {
  it("counts each kind of order in the singular and the plural", () => {
    expect(againstCountLabel("dispatch_on_time", 9)).toBe("9 atrasados");
    expect(againstCountLabel("average_rating", 1)).toBe("1 nota baixa");
    expect(againstCountLabel("supplier_returns", 2)).toBe("2 devolvidos");
  });

  it("agrees the link with reviews and orders", () => {
    expect(seeAllLabel("average_rating", 4)).toBe("Ver as 4 avaliações");
    expect(seeAllLabel("accept_on_time", 9)).toBe("Ver os 9 pedidos");
  });

  it("says the delay or what happened to the parcel", () => {
    expect(orderOutcomeText("dispatch_on_time", 9 * HOUR)).toBe("Atraso de 9 h");
    expect(orderOutcomeText("supplier_cancellations", null)).toBe("Cancelado por você");
    expect(orderOutcomeText("supplier_returns", null)).toBe("Devolvido");
  });
});

describe("performanceFacts", () => {
  it("adds the average time and the supplier's own deadline to the accept", () => {
    const facts = performanceFacts({
      metric: metricOf("accept_on_time"),
      facts: { counted: 3, against: 1, averageMilliseconds: 6 * HOUR + 40 * MINUTE },
      deadlines: { acceptWithinHours: 24, dispatchWithinHours: 48 },
    });
    expect(facts.map((fact) => `${fact.label} ${fact.value}`)).toEqual([
      "Agora sem dados",
      "Tempo médio de aceite 6 h 40 min",
      "Seu prazo 24 horas",
    ]);
  });

  it("counts the returns among the delivered parcels", () => {
    const facts = performanceFacts({
      metric: metricOf("supplier_returns"),
      facts: { counted: 128, against: 5, averageMilliseconds: null },
      deadlines: { acceptWithinHours: null, dispatchWithinHours: null },
    });
    expect(facts.at(-1)).toEqual({ label: "Devolvidos", value: "5 de 128 entregues", delta: null });
  });
});

describe("ordersTabOf", () => {
  it("opens each parcel on the Pedidos tab that lists it", () => {
    expect(ordersTabOf("shipped")).toBe("shipped");
    expect(ordersTabOf("returned")).toBe("closed");
    expect(ordersTabOf("accepted")).toBe("todo");
  });
});
