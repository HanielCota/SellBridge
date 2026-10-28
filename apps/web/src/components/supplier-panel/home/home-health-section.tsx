import { CaretRightIcon, CheckCircleIcon, WarningIcon } from "@phosphor-icons/react";
import {
  SUPPLIER_FLAG_LIMIT,
  SUPPLIER_FLAG_LIMIT_WARNING,
  supplierFlagCountLabel,
} from "@sellbridge/shared/supplier-flags";
import {
  HEALTH_METRIC_LABELS,
  type HealthMetric,
  type SupplierHealth,
} from "@sellbridge/shared/supplier-panel-health";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { TONE_DOT_CLASSES } from "@/components/data/tone-status";
import { TERM_HINTS } from "@/components/icons/action-icons";
import { HighlightBadge } from "@/components/suppliers/reputation";
import { Button } from "@/components/ui/button";
import { HintedText } from "@/components/ui/hint";
import { teamNoticesQueryOptions } from "@/features/supplier-panel/home/team-notices.queries";
import { cn } from "@/lib/utils";
import {
  formatHealthValue,
  HEALTH_LEVEL_TONES,
  LEVEL_TEXT_CLASSES,
  levelSentence,
  metricHint,
} from "./health-format";

function SeeButton({ href, label }: { href: string; label: string }) {
  return (
    <Button size="sm" variant="outline" asChild>
      <a href={href}>
        {label}
        <CaretRightIcon aria-hidden="true" />
      </a>
    </Button>
  );
}

/** A metric off target shows its value in the level's color; a short sample shows a dash. */
function MetricTile({ metric }: { metric: HealthMetric }) {
  const value =
    metric.level === "insufficient" ? "—" : formatHealthValue(metric.definition, metric.value);
  return (
    <div className="space-y-0.5">
      <p
        className={cn(
          "text-xl font-semibold tabular-nums",
          metric.level === "yellow" && "text-amber-700 dark:text-amber-300",
          metric.level === "red" && "text-destructive",
        )}
      >
        {value}
      </p>
      <HintedText
        label={metricHint(metric)}
        className="text-footnote text-muted-foreground hinted-term"
      >
        {HEALTH_METRIC_LABELS[metric.key]}
      </HintedText>
    </div>
  );
}

function PerformanceBlock({ health, href }: { health: SupplierHealth; href: string }) {
  return (
    <div className="min-w-0 space-y-3.5 px-5 py-4.5 sm:flex-[2_1_0%]">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className={cn(
            "size-2 shrink-0 rounded-full",
            TONE_DOT_CLASSES[HEALTH_LEVEL_TONES[health.level]],
          )}
        />
        <h2 className={cn("flex-1 text-subhead font-semibold", LEVEL_TEXT_CLASSES[health.level])}>
          <HintedText label={TERM_HINTS.healthLevel}>{levelSentence(health)}</HintedText>
        </h2>
        <SeeButton href={href} label="Ver desempenho" />
      </div>
      {health.level === "insufficient" ? null : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-3">
          {health.metrics.map((metric) => (
            <MetricTile key={metric.key} metric={metric} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Three segments, one per flag the account can take; the filled ones are the flags that count.
 * Decorative: the line under it says the same count in words.
 */
function FlagMeter({ count, active }: { count: number; active: boolean }) {
  const filledClass = active ? "bg-amber-500" : "bg-destructive";
  return (
    <div aria-hidden="true" className="grid grid-cols-3 gap-1">
      {Array.from({ length: SUPPLIER_FLAG_LIMIT }, (_, index) => (
        <span
          key={index}
          className={cn("h-1.5 rounded-full", index < count ? filledClass : "bg-muted")}
        />
      ))}
    </div>
  );
}

/**
 * The flags beside the performance. While the flags load or fail it shows nothing, never "Sem
 * flags", which would tell a flagged supplier it has none; the flags themselves, with the way
 * to contest each, stay in the "Avisos da equipe" card above the list.
 */
function FlagsBlock({
  supplierId,
  active,
  highlighted,
}: {
  supplierId: string;
  active: boolean;
  highlighted: boolean;
}) {
  const query = useQuery(teamNoticesQueryOptions(supplierId));
  const notices = query.data;
  if (notices === undefined) {
    return null;
  }
  const count = notices.length;
  const clear = count === 0 && active;
  return (
    <section
      aria-label="Sua conta"
      className="min-w-0 space-y-3 border-t sm:flex-[1_1_0%] border-border px-5 py-4.5 sm:border-t-0 sm:border-l"
    >
      <div className="flex items-center gap-2.5">
        {clear ? (
          <CheckCircleIcon
            weight="fill"
            aria-hidden="true"
            className="size-4.5 shrink-0 text-emerald-600 dark:text-emerald-400"
          />
        ) : (
          <WarningIcon
            weight="fill"
            aria-hidden="true"
            className={cn(
              "size-4.5 shrink-0",
              active ? "text-amber-700 dark:text-amber-300" : "text-destructive",
            )}
          />
        )}
        <h2 className="flex-1 text-subhead font-semibold">{clear ? "Sem flags" : "Flags"}</h2>
        <Button size="sm" variant="outline" asChild>
          <Link to="/fornecedor/painel/regras">
            Ver as 5 regras
            <CaretRightIcon aria-hidden="true" />
          </Link>
        </Button>
      </div>
      <FlagMeter count={count} active={active} />
      <p className="text-footnote text-muted-foreground">
        {clear ? "Sua conta está em dia." : `${supplierFlagCountLabel(count)}.`}{" "}
        {SUPPLIER_FLAG_LIMIT_WARNING}
      </p>
      {highlighted ? <HighlightBadge /> : null}
    </section>
  );
}

/** The account's health as the first section of the home's list: performance, then flags. */
export function HomeHealthSection({
  supplierId,
  health,
  performanceHref,
  active,
  highlighted,
}: {
  supplierId: string;
  health: SupplierHealth;
  performanceHref: string;
  active: boolean;
  highlighted: boolean;
}) {
  return (
    <div className="flex flex-col border-b border-border sm:flex-row">
      <PerformanceBlock health={health} href={performanceHref} />
      <FlagsBlock supplierId={supplierId} active={active} highlighted={highlighted} />
    </div>
  );
}
