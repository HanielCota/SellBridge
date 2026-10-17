import type {
  CompletenessIssue,
  CompletenessReport,
} from "@sellbridge/shared/supplier-panel-catalog-completeness";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

function barTone(report: CompletenessReport): string {
  if (report.blocking.length > 0) {
    return "bg-destructive";
  }
  return report.score === 100 ? "bg-emerald-600 dark:bg-emerald-500" : "bg-amber-500";
}

function IssueList({
  title,
  issues,
  tone,
  onFix,
}: {
  title: string;
  issues: readonly CompletenessIssue[];
  tone: "danger" | "warning";
  onFix: (field: string) => void;
}) {
  if (issues.length === 0) {
    return null;
  }
  return (
    <div className="space-y-2">
      <h3
        className={cn(
          "text-footnote font-semibold",
          tone === "danger" ? "text-destructive" : "text-amber-700 dark:text-amber-400",
        )}
      >
        {title} · {issues.length}
      </h3>
      <ul className="space-y-1">
        {issues.map((issue) => (
          <li key={`${issue.field}-${issue.rule}`}>
            <button
              type="button"
              onClick={() => onFix(issue.field)}
              className="w-full rounded-lg px-2 py-1.5 text-left text-sm transition-colors select-none hover:bg-muted active:bg-muted outline-none focus-visible:ring-4 focus-visible:ring-ring/30"
            >
              {issue.message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Live score while the supplier types, with what stops publishing kept apart from what only
 * makes the listing better. Each line jumps to its field.
 */
export function CompletenessMeter({
  report,
  onFix,
}: {
  report: CompletenessReport;
  onFix: (field: string) => void;
}) {
  return (
    <section aria-labelledby="completeness-title" className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="completeness-title" className="text-subhead font-semibold">
            Completude
          </h2>
          <span className="text-2xl font-semibold tracking-tight tabular-nums">
            {report.score}%
          </span>
        </div>
        <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none",
              barTone(report),
            )}
            style={{ width: `${report.score}%` }}
          />
        </div>
      </div>
      <IssueList title="Impede publicar" issues={report.blocking} tone="danger" onFix={onFix} />
      <IssueList
        title="Melhora o anúncio"
        issues={report.improvements}
        tone="warning"
        onFix={onFix}
      />
      {report.blocking.length === 0 && report.improvements.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircleIcon weight="fill" className="size-4" aria-hidden="true" />
          Nada pendente.
        </p>
      ) : null}
    </section>
  );
}
