import {
  HEALTH_METRIC_LABELS,
  type HealthLevel,
  type HealthMetric,
  type SupplierHealth,
} from "@sellbridge/shared/supplier-panel-health";
import { ToneStatus } from "@/components/data/tone-status";
import { cn } from "@/lib/utils";
import { formatHealthValue, HEALTH_LEVEL_TONES, metricHint } from "./health-format";
import { ACTION_ICONS, TERM_HINTS } from "@/components/icons/action-icons";
import { HintedText } from "@/components/ui/hint";

/** The account's level in words, so the dot never carries the meaning alone. */
function levelSentence(health: SupplierHealth): string {
  const sentences: Record<Exclude<HealthLevel, "insufficient">, string> = {
    green: "Desempenho dentro da meta",
    yellow: "Desempenho com métrica fora da meta",
    red: "Desempenho em vermelho",
  };
  if (health.level !== "insufficient") {
    return sentences[health.level];
  }
  const [first] = health.metrics;
  const minimum = first?.definition.minSample ?? 0;
  return `Desempenho conta a partir do ${minimum}º pedido`;
}

const SeeAllIcon = ACTION_ICONS.openOrder.icon;

/** A metric off target shows its value in the level's color; a short sample shows a dash. */
function MetricValue({ metric }: { metric: HealthMetric }) {
  if (metric.level === "insufficient") {
    return <span className="text-foreground">—</span>;
  }
  return (
    <span
      className={cn(
        "text-foreground tabular-nums",
        metric.level === "yellow" && "font-medium text-amber-700 dark:text-amber-300",
        metric.level === "red" && "font-medium text-destructive",
      )}
    >
      {formatHealthValue(metric.definition, metric.value)}
    </span>
  );
}

/** The four health numbers in one line under the list; the full thermometer is on Desempenho. */
export function HealthStrip({ health, href }: { health: SupplierHealth; href: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-footnote">
      <HintedText label={TERM_HINTS.healthLevel}>
        <ToneStatus tone={HEALTH_LEVEL_TONES[health.level]} label={levelSentence(health)} />
      </HintedText>
      {health.level === "insufficient"
        ? null
        : health.metrics.map((metric) => (
            <span key={metric.key} className="text-muted-foreground">
              <HintedText
                label={metricHint(metric)}
                className="underline decoration-dotted underline-offset-4"
              >
                {HEALTH_METRIC_LABELS[metric.key]}
              </HintedText>{" "}
              <MetricValue metric={metric} />
            </span>
          ))}
      <a
        href={href}
        className="ml-auto rounded-sm font-medium text-brand-text underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Ver desempenho
        <SeeAllIcon className="ml-1 inline size-3.5 align-[-2px]" aria-hidden="true" />
      </a>
    </div>
  );
}
