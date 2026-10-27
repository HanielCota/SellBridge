import { REVIEW_ASPECT_LABELS } from "@sellbridge/shared/schemas";
import {
  MIN_REVIEWS_FOR_SCORE,
  OPERATION_METRIC_LABELS,
  SCORE_LEVEL_LABELS,
  SCORE_WINDOW_DAYS,
  type SupplierReputation,
} from "@sellbridge/shared/supplier-score";
import { CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { supplierReputationQueryOptions } from "@/features/suppliers/suppliers.queries";
import { formatPercent } from "@/lib/percent";
import { TERM_HINTS } from "@/components/icons/action-icons";
import { HintedText } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import { HighlightBadge, LEVEL_COLORS, ReputationThermometer, StarAverage } from "./reputation";

const precisePercent = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});

/** Dotted underline: the sign, as on the overview's "Ticket médio", that a term has a legend. */
const TERM_UNDERLINE = "hinted-term";

/** Aspects at or above this share of praise get the check; below, the warning. */
const GOOD_ASPECT_SHARE = 0.8;

function ScoreHeadline({ reputation }: { reputation: SupplierReputation }) {
  if (reputation.score === null || reputation.level === null) {
    const missing = MIN_REVIEWS_FOR_SCORE - reputation.reviewCount;
    return (
      <div className="space-y-1">
        <p className="text-2xl font-semibold tracking-tight">Novo fornecedor</p>
        <p className="text-sm text-muted-foreground">
          {missing === 1
            ? "Falta 1 avaliação para o score aparecer."
            : `Faltam ${missing} avaliações para o score aparecer.`}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <p className="flex items-baseline gap-2">
        <span className="text-4xl font-semibold tracking-tight tabular-nums">
          {reputation.score}
        </span>
        <HintedText
          label={TERM_HINTS.scoreLevel}
          className={cn(
            "text-subhead font-medium",
            LEVEL_COLORS[reputation.level].text,
            TERM_UNDERLINE,
          )}
        >
          {SCORE_LEVEL_LABELS[reputation.level]}
        </HintedText>
      </p>
      <p className="text-xs text-muted-foreground">
        De 0 a 100, pelas avaliações de quem já vendeu os produtos deste fornecedor.
      </p>
    </div>
  );
}

function ScoreColumn({ reputation }: { reputation: SupplierReputation }) {
  const { sentiment } = reputation;
  return (
    <div className="space-y-3">
      <p className="text-footnote text-muted-foreground">
        Score do fornecedor · últimos {SCORE_WINDOW_DAYS} dias
      </p>
      <ScoreHeadline reputation={reputation} />
      <ReputationThermometer level={reputation.level} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StarAverage average={reputation.average} reviewCount={reputation.reviewCount} />
        {reputation.highlighted ? <HighlightBadge /> : null}
      </div>
      {sentiment ? (
        <p className="text-xs text-muted-foreground">
          {formatPercent(sentiment.positive)} positivas · {formatPercent(sentiment.neutral)} neutras
          · {formatPercent(sentiment.negative)} negativas
        </p>
      ) : null}
    </div>
  );
}

function CheckRow({
  label,
  value,
  hint,
  ok,
  legend,
}: {
  label: string;
  value: string;
  hint?: string;
  ok: boolean | null;
  /** Legend on the row's name, for names that need explaining. */
  legend?: string;
}) {
  const Icon = ok === false ? WarningCircleIcon : CheckCircleIcon;
  return (
    <li className="flex items-center justify-between gap-3 py-2.5 text-sm">
      {legend ? (
        <HintedText label={legend} className={TERM_UNDERLINE}>
          {label}
        </HintedText>
      ) : (
        <span>{label}</span>
      )}
      <span className="flex items-center gap-1.5 tabular-nums">
        {hint ? (
          <HintedText
            label={TERM_HINTS.metricGoal}
            className={cn("text-xs text-muted-foreground", TERM_UNDERLINE)}
          >
            {hint}
          </HintedText>
        ) : null}
        <span className="font-medium">{value}</span>
        {ok === null ? null : (
          <Icon
            weight="fill"
            className={cn(
              "size-4",
              ok ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400",
            )}
            aria-hidden="true"
          />
        )}
        {ok === null ? null : (
          <span className="sr-only">{ok ? "Dentro do esperado" : "Abaixo do esperado"}</span>
        )}
      </span>
    </li>
  );
}

/** What reviews say about each aspect, then the order metrics against their targets. */
function BreakdownColumn({ reputation }: { reputation: SupplierReputation }) {
  return (
    <ul className="divide-y">
      {reputation.aspects.map((aspect) => (
        <CheckRow
          key={aspect.aspect}
          label={REVIEW_ASPECT_LABELS[aspect.aspect]}
          legend={TERM_HINTS.reviewAspect}
          value={aspect.share === null ? "Poucas menções" : formatPercent(aspect.share)}
          ok={aspect.share === null ? null : aspect.share >= GOOD_ASPECT_SHARE}
        />
      ))}
      {reputation.metrics.map((metric) => (
        <CheckRow
          key={metric.key}
          label={OPERATION_METRIC_LABELS[metric.key]}
          value={metric.rate === null ? "Sem pedidos" : precisePercent.format(metric.rate)}
          hint={`meta até ${precisePercent.format(metric.limit)}`}
          ok={metric.rate === null ? null : metric.withinLimit}
        />
      ))}
    </ul>
  );
}

/**
 * Reputation block of the supplier page, between the header and the catalog. Review comments
 * are not here: only moderation reads them (see `reviews.moderate`).
 */
export function ReputationPanel({ supplierId }: { supplierId: string }) {
  const query = useQuery(supplierReputationQueryOptions(supplierId));
  if (query.isPending) {
    return <Skeleton className="h-56 rounded-3xl" aria-label="Carregando reputação" />;
  }
  // The catalog below still works without the score, so a failure only hides the block.
  if (query.isError) {
    return null;
  }
  const { reputation } = query.data;
  return (
    <section
      aria-label="Reputação do fornecedor"
      className="surface-card rounded-3xl bg-card p-5 sm:p-6"
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:gap-10">
        <ScoreColumn reputation={reputation} />
        <BreakdownColumn reputation={reputation} />
      </div>
    </section>
  );
}
