import {
  SCORE_LEVEL_LABELS,
  SCORE_LEVELS,
  type ScoreLevel,
  type SupplierReputation,
} from "@sellbridge/shared/supplier-score";
import { StarIcon } from "@phosphor-icons/react";
import { GoldMedal } from "@/components/icons/gold-medal";
import { TERM_HINTS } from "@/components/icons/action-icons";
import { HintedText } from "@/components/ui/hint";
import { cn } from "@/lib/utils";

/** One colour per level, from red to green, like Mercado Livre's thermometer. */
export const LEVEL_COLORS: Record<ScoreLevel, { segment: string; text: string }> = {
  critical: { segment: "bg-red-500", text: "text-red-600 dark:text-red-400" },
  attention: { segment: "bg-orange-500", text: "text-orange-700 dark:text-orange-400" },
  regular: { segment: "bg-amber-400", text: "text-amber-700 dark:text-amber-300" },
  good: { segment: "bg-lime-500", text: "text-lime-700 dark:text-lime-400" },
  excellent: { segment: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400" },
};

const oneDecimal = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatAverage(average: number): string {
  return oneDecimal.format(average);
}

/**
 * Five segments with only the supplier's level lit; the others stay as a faint track so the
 * position on the scale reads at a glance. Unscored suppliers show an empty track.
 */
export function ReputationThermometer({
  level,
  className,
}: {
  level: ScoreLevel | null;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-1", className)}>
      <span className="sr-only">
        {level ? `Reputação: ${SCORE_LEVEL_LABELS[level]}` : "Reputação ainda sem nota"}
      </span>
      {SCORE_LEVELS.map((segment) => (
        <span
          key={segment}
          aria-hidden="true"
          className={cn(
            "h-1.5 flex-1 rounded-full",
            segment === level ? LEVEL_COLORS[segment].segment : "bg-muted",
          )}
        />
      ))}
    </div>
  );
}

export function StarAverage({
  average,
  reviewCount,
}: {
  average: number | null;
  reviewCount: number;
}) {
  if (average === null) {
    return <span className="text-xs text-muted-foreground">Sem avaliações</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs tabular-nums">
      <StarIcon weight="fill" className="size-3.5 text-amber-500" aria-hidden="true" />
      <span className="font-medium">{formatAverage(average)}</span>
      <span className="text-muted-foreground">
        ({reviewCount} {reviewCount === 1 ? "avaliação" : "avaliações"})
      </span>
    </span>
  );
}

export function HighlightBadge({ focusable = true }: { focusable?: boolean }) {
  return (
    <HintedText
      focusable={focusable}
      label={TERM_HINTS.highlightedSupplier}
      className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-amber-700 dark:text-amber-300"
    >
      <GoldMedal className="size-4 shrink-0" aria-hidden="true" />
      Fornecedor destaque
    </HintedText>
  );
}

/** Why the level sits below the stars: the order metrics past their limits, if any. */
function metricsWarning(reputation: SupplierReputation): string | null {
  const over = new Set(
    reputation.metrics.filter((metric) => !metric.withinLimit).map((metric) => metric.key),
  );
  if (over.size === 2) {
    return "Cancelamentos e devoluções acima da meta";
  }
  if (over.has("cancellations")) {
    return "Cancelamentos acima da meta";
  }
  if (over.has("returns")) {
    return "Devoluções acima da meta";
  }
  return null;
}

/** The score beside its level, so the number reads without hovering (proposal B, docs/PLANO-UX-ICONES.md). */
function ScoreNumber({ score }: { score: number | null }) {
  if (score === null) {
    return null;
  }
  return (
    <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">· {score}</span>
  );
}

// Cards stretch their link over the whole card (`after:inset-0`); `relative z-10` lifts the level
// above it, so the pointer reaches the legend.
function LevelLabel({ reputation }: { reputation: SupplierReputation }) {
  if (reputation.highlighted) {
    return (
      <span className="relative z-10 inline-flex items-center gap-1">
        <HighlightBadge focusable={false} />
        <ScoreNumber score={reputation.score} />
      </span>
    );
  }
  if (reputation.level === null) {
    return (
      <HintedText
        label={TERM_HINTS.newSupplier}
        className="relative z-10 text-xs text-muted-foreground"
        focusable={false}
      >
        Novo fornecedor
      </HintedText>
    );
  }
  return (
    <span className="relative z-10 inline-flex items-center gap-1">
      <HintedText
        label={TERM_HINTS.scoreLevel}
        className={cn("text-xs font-medium", LEVEL_COLORS[reputation.level].text)}

        focusable={false}
      >
        {SCORE_LEVEL_LABELS[reputation.level]}
      </HintedText>
      <ScoreNumber score={reputation.score} />
    </span>
  );
}

/** Compact reputation for a supplier card: thermometer, level or badge, stars and any metric off target. */
export function ReputationSummary({ reputation }: { reputation: SupplierReputation }) {
  const warning = reputation.level === null ? null : metricsWarning(reputation);
  return (
    <div className="space-y-2">
      <ReputationThermometer level={reputation.level} />
      {/* Level, then stars, in every card: side by side they wrapped only on some cards. */}
      <div className="flex flex-col items-start gap-1">
        <LevelLabel reputation={reputation} />
        <StarAverage average={reputation.average} reviewCount={reputation.reviewCount} />
      </div>
      {warning && <p className="text-xs text-muted-foreground">{warning}</p>}
    </div>
  );
}
