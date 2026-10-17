import type { StatusTone } from "@/components/data/tone-status";
import type {
  HealthLevel,
  HealthMetric,
  HealthMetricDefinition,
} from "@sellbridge/shared/supplier-panel-health";

/** How the thermometer's numbers read: shares with one decimal, stars with one decimal. */
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
const stars = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const points = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export function formatHealthValue(
  definition: HealthMetricDefinition,
  value: number | null,
): string {
  if (value === null) {
    return "—";
  }
  return definition.unit === "stars" ? stars.format(value) : percent.format(value);
}

/** The line beside each value: "meta ≥ 90%", "meta ≤ 2%", "meta ≥ 4,0". */
export function formatHealthTarget(definition: HealthMetricDefinition): string {
  const sign = definition.direction === "higher_is_better" ? "≥" : "≤";
  return `meta ${sign} ${formatHealthValue(definition, definition.target)}`;
}

export const HEALTH_LEVEL_TONES: Record<HealthLevel, StatusTone> = {
  green: "success",
  yellow: "warning",
  red: "danger",
  insufficient: "muted",
};

/** Segment colors of the three-step thermometer, from red to green. */
export const HEALTH_SEGMENT_CLASSES: Record<Exclude<HealthLevel, "insufficient">, string> = {
  red: "bg-red-500",
  yellow: "bg-amber-400",
  green: "bg-emerald-500",
};

export interface HealthDelta {
  /** Arrow direction: "up" always means better, so the color follows the meaning. */
  direction: "up" | "down" | "flat";
  label: string;
}

/**
 * The change against the previous 60 days, as an unsigned amount ("2,5 p.p.", "0,3 estrela").
 * For cancellations a drop is good news, so the arrow follows better or worse, not the sign.
 */
export function healthDelta(metric: HealthMetric): HealthDelta | null {
  if (metric.trend === null || metric.previousValue === null || metric.value === null) {
    return null;
  }
  const difference = Math.abs(metric.value - metric.previousValue);
  // In Portuguese a quantity under two takes the singular: "0,5 estrela".
  const label =
    metric.definition.unit === "stars"
      ? `${stars.format(difference)} ${difference < 2 ? "estrela" : "estrelas"}`
      : `${points.format(difference * 100)} p.p.`;
  if (metric.trend === "flat") {
    return { direction: "flat", label: "estável" };
  }
  return { direction: metric.trend === "better" ? "up" : "down", label };
}

/** What the sample says when it is too small: never a red number from three orders. */
export function sampleNote(metric: HealthMetric): string {
  const noun = metric.definition.unit === "stars" ? "avaliações" : "pedidos";
  return `${metric.sample} de ${metric.definition.minSample} ${noun} para medir`;
}
