import { describe, expect, it } from "vitest";
import {
  healthForecast,
  healthForecastText,
  metricValue,
} from "./supplier-panel-health-forecast.ts";
import {
  HEALTH_METRIC_DEFINITIONS,
  levelOfValue,
  RATING_FLOOR,
  RATING_TARGET,
  SUPPLIER_CANCELLATION_LIMIT,
} from "./supplier-panel-health-metrics.ts";

const cancellations = HEALTH_METRIC_DEFINITIONS.supplier_cancellations;
const rating = HEALTH_METRIC_DEFINITIONS.average_rating;
const accept = HEALTH_METRIC_DEFINITIONS.accept_on_time;

describe("thresholds", () => {
  it("takes the rating lines from the public score levels", () => {
    expect(RATING_TARGET).toBe(4);
    expect(RATING_FLOOR).toBe(3.4);
  });

  it("starts red where the public score starts losing points on cancellations", () => {
    expect(SUPPLIER_CANCELLATION_LIMIT).toBe(0.025);
  });

  it("includes the line itself in the better level", () => {
    expect(levelOfValue(accept, 0.95)).toBe("green");
    expect(levelOfValue(accept, 0.85)).toBe("yellow");
    expect(levelOfValue(accept, 0.849)).toBe("red");
    expect(levelOfValue(rating, 3.4)).toBe("yellow");
    expect(levelOfValue(rating, 3.39)).toBe("red");
  });
});

describe("metricValue", () => {
  it("reads the cancellation share from the bad events, without rounding drift", () => {
    expect(metricValue(cancellations, { good: 98, counted: 100 })).toBe(0.02);
    expect(metricValue(cancellations, { good: 0, counted: 0 })).toBeNull();
  });
});

describe("healthForecast", () => {
  it("counts cancellations until yellow", () => {
    // 1 / 51 = 1.96% is green; 2 / 52 = 3.8% skips straight to red.
    expect(healthForecast(cancellations, { good: 50, counted: 50 }, "green")).toEqual({
      kind: "worsen",
      events: 2,
      toLevel: "red",
    });
  });

  it("counts one-star reviews until the next level", () => {
    // (40 + 1) / 11 = 3.73 is under 4.
    expect(healthForecast(rating, { good: 40, counted: 10 }, "green")).toEqual({
      kind: "worsen",
      events: 1,
      toLevel: "yellow",
    });
  });

  it("counts five-star reviews until yellow from red", () => {
    // (30 + 5) / 11 = 3.18; (30 + 10) / 12 = 3.33; (30 + 15) / 13 = 3.46.
    expect(healthForecast(rating, { good: 30, counted: 10 }, "red")).toEqual({
      kind: "recover",
      events: 3,
      toLevel: "yellow",
    });
  });

  it("asks for at least one more order when the sample is short", () => {
    expect(healthForecast(accept, { good: 30, counted: 30 }, "insufficient")).toEqual({
      kind: "collect",
      events: 1,
    });
  });
});

describe("healthForecastText", () => {
  it("speaks the warning in the singular and the plural", () => {
    expect(
      healthForecastText("dispatch_on_time", { kind: "worsen", events: 1, toLevel: "yellow" }),
    ).toBe("Mais 1 despacho atrasado e você passa para amarelo.");
    expect(
      healthForecastText("supplier_cancellations", { kind: "worsen", events: 2, toLevel: "red" }),
    ).toBe("Mais 2 cancelamentos seus e você passa para vermelho.");
  });

  it("speaks the way back", () => {
    expect(
      healthForecastText("average_rating", { kind: "recover", events: 3, toLevel: "yellow" }),
    ).toBe("3 avaliações de 5 estrelas em sequência e você volta para amarelo.");
    expect(
      healthForecastText("accept_on_time", { kind: "recover", events: 1, toLevel: "yellow" }),
    ).toBe("1 aceite no prazo em sequência e você volta para amarelo.");
  });

  it("says what is missing to measure", () => {
    expect(healthForecastText("accept_on_time", { kind: "collect", events: 4 })).toBe(
      "Faltam 4 pedidos para medir.",
    );
    expect(healthForecastText("average_rating", { kind: "collect", events: 1 })).toBe(
      "Falta 1 avaliação para medir.",
    );
    expect(healthForecastText("accept_on_time", { kind: "steady" })).toBeNull();
  });
});
