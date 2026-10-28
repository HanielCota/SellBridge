import { REVIEW_TAG_LABELS } from "@sellbridge/shared/schemas";
import { SCORE_WINDOW_DAYS } from "@sellbridge/shared/supplier-score";
import type {
  ReviewSummary,
  ReviewTagCount,
} from "@/features/supplier-panel/performance/review-summary";
import { cn } from "@/lib/utils";

/**
 * Each kind keeps one color from the number down to its reasons: green praise, amber neutral,
 * red complaints. Text shades pass 4.5:1 on the card in both themes.
 */
const KINDS = [
  {
    key: "positive",
    label: "Positivas (4 e 5)",
    text: "text-brand-text",
    dot: "bg-emerald-600 dark:bg-emerald-500",
  },
  {
    key: "neutral",
    label: "Neutras (3)",
    text: "text-amber-700 dark:text-amber-300",
    dot: "bg-amber-600 dark:bg-amber-500",
  },
  { key: "negative", label: "Negativas (1 e 2)", text: "text-destructive", dot: "bg-destructive" },
] as const;

function reviewsWord(count: number): string {
  return count === 1 ? "1 avaliação" : `${count} avaliações`;
}

function SplitCell({
  kind,
  count,
  total,
}: {
  kind: (typeof KINDS)[number];
  count: number;
  total: number;
}) {
  const percent = total === 0 ? 0 : Math.round((count / total) * 100);
  return (
    <div className="flex min-w-0 flex-col gap-0.5 bg-card px-5 py-4">
      <span
        className={cn(
          "text-2xl font-semibold tabular-nums",
          count > 0 ? kind.text : "text-muted-foreground",
        )}
      >
        {percent}%
      </span>
      <span className="flex items-center gap-1.5 text-footnote text-muted-foreground">
        <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", kind.dot)} />
        {kind.label}
      </span>
      <span className="text-footnote text-muted-foreground tabular-nums">{reviewsWord(count)}</span>
    </div>
  );
}

function TagGroup({
  title,
  tags,
  tone,
}: {
  title: string;
  tags: readonly ReviewTagCount[];
  tone: "praise" | "complaint";
}) {
  const text = tone === "praise" ? "text-brand-text" : "text-destructive";
  return (
    <div className="min-w-0 border-border not-first:border-t sm:not-first:border-t-0 sm:not-first:border-l">
      <h3
        className={cn(
          "mb-1 flex items-center gap-2 px-5 py-2.5 text-footnote font-semibold",
          text,
          tone === "praise" ? "bg-emerald-500/10" : "bg-destructive/10",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "size-2 shrink-0 rounded-full",
            tone === "praise" ? "bg-emerald-600 dark:bg-emerald-500" : "bg-destructive",
          )}
        />
        {title}
      </h3>
      {tags.length === 0 ? (
        <p className="px-5 pt-1 pb-3 text-footnote text-muted-foreground">Nenhum motivo marcado.</p>
      ) : (
        <ul className="pb-1.5 [&>li+li]:border-t [&>li+li]:border-foreground/[0.04]">
          {tags.map((entry) => (
            <li
              key={entry.tag}
              title={`${reviewsWord(entry.count)} ${entry.count === 1 ? "marcou" : "marcaram"} isso`}
              className="flex items-center justify-between gap-3 px-5 py-2 text-sm"
            >
              <span>{REVIEW_TAG_LABELS[entry.tag]}</span>
              <span className={cn("font-semibold tabular-nums", text)}>{entry.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The public score's reviews in numbers: how they split and what they praise or complain. */
export function PerformanceReviews({ reviews }: { reviews: ReviewSummary }) {
  const total = reviews.positive + reviews.neutral + reviews.negative;
  return (
    <section aria-labelledby="performance-reviews-title" className="border-t border-border">
      <div className="flex min-h-8 items-center gap-2 px-5 pt-4 pb-2.5">
        <h2 id="performance-reviews-title" className="text-subhead font-medium">
          Avaliações
        </h2>
        <span className="text-sm text-muted-foreground">
          {reviewsWord(total)} em {SCORE_WINDOW_DAYS} dias
        </span>
      </div>
      <div className="grid gap-px border-y border-border bg-border sm:grid-cols-3">
        {KINDS.map((kind) => (
          <SplitCell key={kind.key} kind={kind} count={reviews[kind.key]} total={total} />
        ))}
      </div>
      <div className="grid sm:grid-cols-2">
        <TagGroup title="Mais elogiado" tags={reviews.praise} tone="praise" />
        <TagGroup title="Mais reclamado" tags={reviews.complaints} tone="complaint" />
      </div>
    </section>
  );
}
