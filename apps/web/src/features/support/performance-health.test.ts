import type { SupportHealthMetric } from "@sellbridge/shared/support-performance";
import { describe, expect, it } from "vitest";
import {
  drillDetailText,
  formatHealthTarget,
  formatHealthValue,
  healthChange,
  healthForecast,
} from "./performance-health";

function metric(overrides: Partial<SupportHealthMetric>): SupportHealthMetric {
  return {
    key: "on_time",
    level: "warning",
    current: 0.84,
    previous: 0.87,
    sample: 100,
    target: 0.9,
    toTarget: 60,
    drillDown: [],
    drillDownTotal: 0,
    ...overrides,
  };
}

describe("support health copy", () => {
  it("says the target the way the supplier's Desempenho does", () => {
    expect(formatHealthTarget(metric({}))).toBe("meta: 90% ou mais");
    expect(formatHealthTarget(metric({ key: "overdue_now", target: 2 }))).toBe("meta: até 2");
    expect(formatHealthTarget(metric({ key: "rating", target: 4.5 }))).toBe("meta: 4,5 ou mais");
  });

  it("formats each metric in its own unit", () => {
    expect(formatHealthValue("on_time", 0.84)).toBe("84%");
    expect(formatHealthValue("overdue_now", 3)).toBe("3");
    expect(formatHealthValue("rating", 4.62)).toBe("4,6");
    expect(formatHealthValue("no_reopen", null)).toBe("—");
  });

  it("tells how many good tickets bring the metric back to the target", () => {
    expect(healthForecast(metric({}))).toBe("Com mais 60 respostas no prazo, volta para a meta.");
    expect(healthForecast(metric({ key: "rating", toTarget: 1 }))).toBe(
      "Com mais 1 nota 5, volta para a meta.",
    );
    expect(healthForecast(metric({ key: "overdue_now", current: 3, toTarget: 1 }))).toBe(
      "Responder 1 deles já volta para a meta.",
    );
  });

  it("says how much a metric on target stands on, and when there is too little to measure", () => {
    expect(healthForecast(metric({ level: "on_target", toTarget: null, sample: 104 }))).toBe(
      "104 primeiras respostas contam neste período.",
    );
    expect(healthForecast(metric({ level: "insufficient", sample: 3 }))).toBe(
      "Poucos dados: 3 de 5 para medir.",
    );
  });

  it("never compares the queue right now with a previous period", () => {
    expect(healthChange(metric({ key: "overdue_now", previous: null }))).toBeNull();
    expect(healthChange(metric({}))).toEqual({ direction: "down", label: "3 p.p.", good: false });
  });

  it("describes why a ticket counts against the metric", () => {
    expect(drillDetailText({ kind: "unanswered" })).toBe("sem resposta");
    expect(drillDetailText({ kind: "rating", rating: 1 })).toBe("1 estrela");
    expect(drillDetailText({ kind: "came_back" })).toBe("voltou");
  });
});
