import {
  HEALTH_LEVEL_LABELS,
  type HealthLevel,
  type SupplierHealth,
} from "@sellbridge/shared/supplier-panel-health";
import {
  MIN_REVIEWS_FOR_SCORE,
  SCORE_LEVEL_LABELS,
  SCORE_WINDOW_DAYS,
  type SupplierReputation,
} from "@sellbridge/shared/supplier-score";
import {
  LEVEL_COLORS,
  ReputationThermometer,
  StarAverage,
} from "@/components/suppliers/reputation";
import { cn } from "@/lib/utils";
import { HEALTH_SEGMENT_CLASSES } from "./health-format";
import { TERM_HINTS } from "@/components/icons/action-icons";
import { HintedText } from "@/components/ui/hint";

const TERM_MARK = "hinted-term";

const SEGMENTS = ["red", "yellow", "green"] as const;

const LEVEL_SUMMARY: Record<HealthLevel, string> = {
  green: "Todas as métricas dentro da meta.",
  yellow: "Uma ou mais métricas fora da meta.",
  red: "Corrija primeiro as métricas em vermelho.",
  insufficient: "Com poucos pedidos, nada conta contra você.",
};

/** Three segments, only the current one lit, like the public score's thermometer. */
function LevelBar({ level }: { level: HealthLevel }) {
  return (
    <div className="flex gap-1" aria-hidden="true">
      {SEGMENTS.map((segment) => (
        <span
          key={segment}
          className={cn(
            "h-1.5 flex-1 rounded-full",
            segment === level ? HEALTH_SEGMENT_CLASSES[segment] : "bg-muted",
          )}
        />
      ))}
    </div>
  );
}

function PublicScore({ reputation }: { reputation: SupplierReputation }) {
  const missing = MIN_REVIEWS_FOR_SCORE - reputation.reviewCount;
  return (
    <div className="space-y-3">
      <p className="text-footnote text-muted-foreground">
        <HintedText label={TERM_HINTS.publicScore} className={TERM_MARK}>
          Score público em {SCORE_WINDOW_DAYS} dias
        </HintedText>
      </p>
      {reputation.score === null || reputation.level === null ? (
        <p className="text-sm text-muted-foreground">
          {missing === 1
            ? "Falta 1 avaliação para o score aparecer."
            : `Faltam ${missing} avaliações para o score aparecer.`}
        </p>
      ) : (
        <p className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold tracking-tight tabular-nums">
            {reputation.score}
          </span>
          <HintedText
            label={TERM_HINTS.scoreLevel}
            className={cn(
              "text-subhead font-medium",
              TERM_MARK,
              LEVEL_COLORS[reputation.level].text,
            )}
          >
            {SCORE_LEVEL_LABELS[reputation.level]}
          </HintedText>
        </p>
      )}
      <ReputationThermometer level={reputation.level} />
      <StarAverage average={reputation.average} reviewCount={reputation.reviewCount} />
    </div>
  );
}

/** The overall level of the account beside the public score it feeds. */
export function HealthThermometer({
  health,
  reputation,
}: {
  health: SupplierHealth;
  reputation: SupplierReputation;
}) {
  return (
    <section
      aria-label="Termômetro da conta"
      className="surface-card grid gap-6 rounded-3xl bg-card p-5 sm:p-6 md:grid-cols-2 md:gap-10"
    >
      <div className="space-y-3">
        <p className="text-footnote text-muted-foreground">
          <HintedText label={TERM_HINTS.accountHealth} className={TERM_MARK}>
            Saúde da conta em {health.windowDays} dias
          </HintedText>
        </p>
        <p className="text-3xl font-semibold tracking-tight">{HEALTH_LEVEL_LABELS[health.level]}</p>
        <LevelBar level={health.level} />
        <p className="text-sm text-muted-foreground">{LEVEL_SUMMARY[health.level]}</p>
      </div>
      <PublicScore reputation={reputation} />
    </section>
  );
}
