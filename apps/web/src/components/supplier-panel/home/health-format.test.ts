import {
  HEALTH_METRIC_DEFINITIONS,
  type HealthMetric,
} from "@sellbridge/shared/supplier-panel-health";
import { describe, expect, it } from "vitest";
import { formatHealthTarget, formatHealthValue, healthDelta, sampleNote } from "./health-format";

function metric(overrides: Partial<HealthMetric> & Pick<HealthMetric, "key">): HealthMetric {
  return {
    definition: HEALTH_METRIC_DEFINITIONS[overrides.key],
    value: 0.9,
    sample: 20,
    level: "green",
    previousValue: null,
    trend: null,
    forecast: { kind: "steady" },
    ...overrides,
  };
}

describe("health formatting", () => {
  it("writes the target beside the value with its direction", () => {
    expect(formatHealthTarget(HEALTH_METRIC_DEFINITIONS.dispatch_on_time)).toBe("meta ≥ 90%");
    expect(formatHealthTarget(HEALTH_METRIC_DEFINITIONS.supplier_cancellations)).toBe("meta ≤ 2%");
    expect(formatHealthTarget(HEALTH_METRIC_DEFINITIONS.average_rating)).toBe("meta ≥ 4,0");
  });

  it("formats shares and stars, and a dash without data", () => {
    expect(formatHealthValue(HEALTH_METRIC_DEFINITIONS.accept_on_time, 0.925)).toBe("92,5%");
    expect(formatHealthValue(HEALTH_METRIC_DEFINITIONS.average_rating, 4.25)).toBe("4,3");
    expect(formatHealthValue(HEALTH_METRIC_DEFINITIONS.average_rating, null)).toBe("—");
  });

  it("points the arrow up for fewer cancellations", () => {
    const delta = healthDelta(
      metric({ key: "supplier_cancellations", value: 0.01, previousValue: 0.035, trend: "better" }),
    );
    expect(delta).toEqual({ direction: "up", label: "2,5 p.p." });
  });

  it("reads a worse rating in stars and a flat trend as stable", () => {
    expect(
      healthDelta(metric({ key: "average_rating", value: 4, previousValue: 4.5, trend: "worse" })),
    ).toEqual({ direction: "down", label: "0,5 estrela" });
    expect(
      healthDelta(
        metric({ key: "accept_on_time", value: 0.95, previousValue: 0.951, trend: "flat" }),
      ),
    ).toEqual({ direction: "flat", label: "estável" });
    expect(healthDelta(metric({ key: "accept_on_time" }))).toBeNull();
  });

  it("says how much of the sample is still missing", () => {
    expect(sampleNote(metric({ key: "dispatch_on_time", sample: 4 }))).toBe(
      "4 de 10 pedidos para medir",
    );
    expect(sampleNote(metric({ key: "average_rating", sample: 2 }))).toBe(
      "2 de 10 avaliações para medir",
    );
  });
});
