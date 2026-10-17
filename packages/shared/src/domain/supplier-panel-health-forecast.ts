import {
  HEALTH_LEVEL_LABELS,
  levelOfValue,
  type HealthLevel,
  type HealthMetricDefinition,
  type HealthMetricKey,
} from "./supplier-panel-health-metrics.ts";

/**
 * One metric's raw sample: for rates, good events (on time, not cancelled) among the counted
 * orders; for the rating, the star sum among the reviews.
 */
export interface MetricTally {
  good: number;
  counted: number;
}

/** What the next orders do to the level ("mais 2 atrasos e você passa para amarelo"). */
export type HealthForecast =
  | { kind: "worsen"; events: number; toLevel: HealthLevel }
  | { kind: "recover"; events: number; toLevel: HealthLevel }
  | { kind: "collect"; events: number }
  | { kind: "steady" };

/** Beyond this many events the forecast says nothing: the level is not at stake. */
export const FORECAST_HORIZON = 500;

/** The metric's value for a sample, or null without any counted event. */
export function metricValue(definition: HealthMetricDefinition, tally: MetricTally): number | null {
  if (tally.counted === 0) {
    return null;
  }
  if (definition.key === "supplier_cancellations") {
    return (tally.counted - tally.good) / tally.counted;
  }
  return tally.good / tally.counted;
}

/** What one bad or good event adds to `good`: a 1- or 5-star review, a late or on-time order. */
function eventWeight(definition: HealthMetricDefinition, event: "bad" | "good"): number {
  if (definition.unit === "stars") {
    return event === "bad" ? 1 : 5;
  }
  return event === "bad" ? 0 : 1;
}

function levelAfter(
  definition: HealthMetricDefinition,
  tally: MetricTally,
  event: "bad" | "good",
  events: number,
): HealthLevel {
  const next = {
    good: tally.good + eventWeight(definition, event) * events,
    counted: tally.counted + events,
  };
  return levelOfValue(definition, metricValue(definition, next) ?? 0);
}

/** Fewest events of one kind that change the level, or null within the horizon. */
function eventsUntilChange(
  definition: HealthMetricDefinition,
  tally: MetricTally,
  event: "bad" | "good",
  from: HealthLevel,
): { events: number; toLevel: HealthLevel } | null {
  const events = Array.from({ length: FORECAST_HORIZON }, (_, index) => index + 1).find(
    (count) => levelAfter(definition, tally, event, count) !== from,
  );
  if (events === undefined) {
    return null;
  }
  return { events, toLevel: levelAfter(definition, tally, event, events) };
}

/**
 * Green and yellow warn how many bad events pull the metric down a level; red says how many
 * good ones bring it back. Too small a sample says how many orders are still missing.
 */
export function healthForecast(
  definition: HealthMetricDefinition,
  tally: MetricTally,
  level: HealthLevel,
): HealthForecast {
  if (level === "insufficient") {
    return { kind: "collect", events: Math.max(definition.minSample - tally.counted, 1) };
  }
  const event = level === "red" ? "good" : "bad";
  const change = eventsUntilChange(definition, tally, event, level);
  if (change === null) {
    return { kind: "steady" };
  }
  return { kind: level === "red" ? "recover" : "worsen", ...change };
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

const BAD_EVENT_NOUNS: Record<HealthMetricKey, readonly [string, string]> = {
  accept_on_time: ["aceite atrasado", "aceites atrasados"],
  dispatch_on_time: ["despacho atrasado", "despachos atrasados"],
  supplier_cancellations: ["cancelamento seu", "cancelamentos seus"],
  average_rating: ["avaliação de 1 estrela", "avaliações de 1 estrela"],
};

const GOOD_EVENT_NOUNS: Record<HealthMetricKey, readonly [string, string]> = {
  accept_on_time: ["aceite no prazo", "aceites no prazo"],
  dispatch_on_time: ["despacho no prazo", "despachos no prazo"],
  supplier_cancellations: ["pedido enviado sem cancelar", "pedidos enviados sem cancelar"],
  average_rating: ["avaliação de 5 estrelas", "avaliações de 5 estrelas"],
};

function levelName(level: HealthLevel): string {
  return HEALTH_LEVEL_LABELS[level].toLowerCase();
}

function collectText(key: HealthMetricKey, events: number): string {
  const missing =
    key === "average_rating"
      ? plural(events, "avaliação", "avaliações")
      : plural(events, "pedido", "pedidos");
  const verb = events === 1 ? "Falta" : "Faltam";
  return `${verb} ${missing} para medir.`;
}

/** The forecast as the supplier reads it, or null when the level is not at stake. */
export function healthForecastText(key: HealthMetricKey, forecast: HealthForecast): string | null {
  if (forecast.kind === "steady") {
    return null;
  }
  if (forecast.kind === "collect") {
    return collectText(key, forecast.events);
  }
  if (forecast.kind === "worsen") {
    const [one, many] = BAD_EVENT_NOUNS[key];
    return `Mais ${plural(forecast.events, one, many)} e você passa para ${levelName(forecast.toLevel)}.`;
  }
  const [one, many] = GOOD_EVENT_NOUNS[key];
  return `${plural(forecast.events, one, many)} em sequência e você volta para ${levelName(forecast.toLevel)}.`;
}
