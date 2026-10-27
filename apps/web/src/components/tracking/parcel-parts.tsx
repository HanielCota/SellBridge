import { DotTimeline, DotTimelineItem } from "@/components/data/dot-timeline";
import { TONE_DOT_CLASSES } from "@/components/data/tone-status";
import { CopyButton } from "@/components/integrations/copy-button";
import type {
  ParcelHistoryEntry,
  ProgressState,
  ProgressStep,
} from "@/features/tracking/parcel-history";
import { cn } from "@/lib/utils";

const DOT_CLASSES: Record<ProgressState, string> = {
  done: "bg-brand-strong",
  current: "bg-brand-strong",
  todo: "bg-card ring-1 ring-inset ring-field-border",
  problem: "bg-amber-600 dark:bg-amber-500",
};

const BAR_CLASSES: Record<ProgressState, string> = {
  done: "bg-brand-strong",
  current: "bg-muted",
  todo: "bg-muted",
  problem: "bg-muted",
};

/** Wide enough for each step's label from `sm` up; the buyer's page has four steps. */
const COLUMN_CLASSES: Record<number, string> = {
  4: "@lg:grid-cols-4",
  5: "@lg:grid-cols-5",
};

/**
 * A parcel's steps: one row when the card is wide, a column when it is narrow (a phone, the staff
 * side panel), where five labels side by side would break mid-word. Measured on the card, not
 * the screen.
 */
export function ParcelProgress({ steps }: { steps: readonly ProgressStep[] }) {
  return (
    <div className="@container">
      <ol
        aria-label="Etapas do envio"
        className={cn("grid gap-2 @lg:gap-1", COLUMN_CLASSES[steps.length] ?? "@lg:grid-flow-col")}
      >
        {steps.map((step, index) => (
          <li
            key={step.label}
            className="flex min-w-0 items-center gap-3 @lg:flex-col @lg:items-stretch @lg:gap-2"
            aria-current={step.state === "current" ? "step" : undefined}
          >
            <span className="flex items-center" aria-hidden="true">
              <span className={cn("size-3 shrink-0 rounded-full", DOT_CLASSES[step.state])} />
              {index === steps.length - 1 ? null : (
                <span
                  className={cn(
                    "mx-1.5 hidden h-0.5 flex-1 rounded-full @lg:block",
                    BAR_CLASSES[step.state],
                  )}
                />
              )}
            </span>
            <span
              className={cn(
                "text-footnote leading-tight",
                step.state === "todo" && "text-muted-foreground",
                step.state === "done" && "font-medium text-foreground",
                // The step it is on reads heavier than the ones behind it: no halo, just the label.
                (step.state === "current" || step.state === "problem") &&
                  "font-semibold text-foreground",
              )}
            >
              {step.label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Carrier and code, the code copies in one tap, and the carrier's own page when there is one. */
export function ParcelCodeBox({
  carrier,
  code,
  url,
}: {
  carrier: string | null;
  code: string;
  url: string | null;
}) {
  return (
    <div className="flex flex-wrap items-start gap-x-6 gap-y-3 rounded-2xl bg-muted/60 px-4 py-3">
      <div className="min-w-0 space-y-0.5">
        <p className="text-footnote text-muted-foreground">Transportadora</p>
        <p className="text-sm font-medium">{carrier ?? "Não informada"}</p>
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-footnote text-muted-foreground">Código de rastreio</p>
        <CopyButton value={code} label="Copiar código de rastreio" className="max-w-full break-all">
          {code}
        </CopyButton>
      </div>
      {url === null ? null : (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium underline-offset-4 hover:underline"
        >
          Consultar rastreio
        </a>
      )}
    </div>
  );
}

/** "Histórico do envio": SellBridge's steps and the carrier's scans, newest first. */
export function ParcelHistoryList({ entries }: { entries: readonly ParcelHistoryEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum passo registrado ainda.</p>;
  }
  return (
    <DotTimeline label="Histórico do envio">
      {entries.map((entry) => (
        <DotTimelineItem
          key={entry.key}
          dotClassName={TONE_DOT_CLASSES[entry.tone]}
          date={entry.at}
        >
          <span className="block font-medium text-foreground">{entry.label}</span>
          {entry.detail === null ? null : (
            <span className="block text-muted-foreground">{entry.detail}</span>
          )}
        </DotTimelineItem>
      ))}
    </DotTimeline>
  );
}
