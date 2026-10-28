import type { SupplierHealth } from "@sellbridge/shared/supplier-panel-health";
import {
  MIN_REVIEWS_FOR_SCORE,
  SCORE_LEVEL_LABELS,
  type SupplierReputation,
} from "@sellbridge/shared/supplier-score";
import { TONE_DOT_CLASSES } from "@/components/data/tone-status";
import { TERM_HINTS } from "@/components/icons/action-icons";
import {
  formatAverage,
  LEVEL_COLORS,
  ReputationThermometer,
} from "@/components/suppliers/reputation";
import { HintedText } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import { HEALTH_LEVEL_TONES, LEVEL_TEXT_CLASSES, levelSentence } from "../home/health-format";

const LEVEL_SUMMARY: Record<SupplierHealth["level"], string> = {
  green: "Todas as métricas dentro da meta.",
  yellow: "Uma ou mais métricas fora da meta.",
  red: "Corrija primeiro as métricas em vermelho.",
  insufficient: "Com poucos pedidos, nada conta contra você.",
};

function scoreLine(reputation: SupplierReputation): string {
  if (reputation.score === null || reputation.average === null) {
    const missing = MIN_REVIEWS_FOR_SCORE - reputation.reviewCount;
    return missing === 1
      ? "Falta 1 avaliação para o score aparecer."
      : `Faltam ${missing} avaliações para o score aparecer.`;
  }
  const reviews = reputation.reviewCount === 1 ? "avaliação" : "avaliações";
  return `Média ${formatAverage(reputation.average)} em ${reputation.reviewCount} ${reviews}. É o que os revendedores veem.`;
}

function PublicScore({ reputation }: { reputation: SupplierReputation }) {
  const { score, level } = reputation;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2.5 px-5 pb-4.5 sm:py-4.5">
      <div className="flex items-baseline gap-2">
        <h2 className="flex-1 text-subhead font-semibold">
          <HintedText label={TERM_HINTS.publicScore} className="hinted-term">
            Score público
          </HintedText>
        </h2>
        {score === null || level === null ? null : (
          <>
            <span className="text-subhead font-semibold tabular-nums">{score}</span>
            <HintedText
              label={TERM_HINTS.scoreLevel}
              className={cn("text-footnote font-medium", LEVEL_COLORS[level].text)}
            >
              {SCORE_LEVEL_LABELS[level]}
            </HintedText>
          </>
        )}
      </div>
      <ReputationThermometer level={level} />
      <p className="text-footnote text-muted-foreground">{scoreLine(reputation)}</p>
    </div>
  );
}

/**
 * The top of the card: the account's color in one sentence beside the public score it feeds,
 * read as one header (no divider), like the supplier home.
 */
export function PerformanceOverview({
  health,
  reputation,
}: {
  health: SupplierHealth;
  reputation: SupplierReputation;
}) {
  return (
    <div className="flex flex-col sm:flex-row">
      <div className="flex min-w-0 flex-col gap-1.5 px-5 py-4.5 sm:flex-[2_1_0%]">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className={cn(
              "size-2 shrink-0 rounded-full",
              TONE_DOT_CLASSES[HEALTH_LEVEL_TONES[health.level]],
            )}
          />
          <h2 className={cn("text-subhead font-semibold", LEVEL_TEXT_CLASSES[health.level])}>
            <HintedText label={TERM_HINTS.healthLevel} className="hinted-term">
              {levelSentence(health)}
            </HintedText>
          </h2>
        </div>
        <p className="text-footnote text-muted-foreground">
          {LEVEL_SUMMARY[health.level]} Só você vê esta cor.
        </p>
      </div>
      <PublicScore reputation={reputation} />
    </div>
  );
}
