import type { BulkPublishSkip } from "@sellbridge/shared/bulk-publish-plan";
import { estimatePublishProgress } from "@sellbridge/shared/publish-progress";
import {
  CheckCircleIcon,
  CircleNotchIcon,
  MinusCircleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ProgressWithEta } from "@/components/ui/progress-with-eta";
import {
  type BulkPublishTally,
  bulkPublishHeading,
  bulkPublishOutcome,
  type OutcomeLine,
  skippedDetails,
} from "@/features/catalog/bulk-publish-outcome";
import { bulkPublishProgressQueryOptions } from "@/features/catalog/catalog.queries";
import { cn } from "@/lib/utils";
import { SettingsGroup } from "./bulk-publish-parts";

/** What the server answered when the batch went out: the jobs to follow and who stayed out. */
export interface PublishedBatch {
  targetIds: string[];
  skipped: BulkPublishSkip[];
}

const SKIPPED_SHOWN = 5;

const TONE_CLASS: Record<OutcomeLine["tone"], string> = {
  positive: "text-brand-text",
  negative: "text-destructive",
  neutral: "text-muted-foreground",
};

function OutcomeIcon({ line }: { line: OutcomeLine }) {
  const className = cn("size-5 shrink-0", TONE_CLASS[line.tone]);
  if (line.key === "published") {
    return <CheckCircleIcon weight="fill" className={className} aria-hidden="true" />;
  }
  if (line.key === "failed") {
    return <WarningCircleIcon weight="fill" className={className} aria-hidden="true" />;
  }
  if (line.key === "pending") {
    return <CircleNotchIcon className={cn(className, "animate-spin")} aria-hidden="true" />;
  }
  return <MinusCircleIcon className={className} aria-hidden="true" />;
}

function OutcomeRows({ tally }: { tally: BulkPublishTally }) {
  return (
    <SettingsGroup title={bulkPublishHeading(tally)}>
      {bulkPublishOutcome(tally).map((line) => (
        <div key={line.key} className="flex items-start gap-3 px-3.5 py-2.5">
          <OutcomeIcon line={line} />
          <div className="min-w-0 flex-1 text-sm">
            <p>{line.label}</p>
            {line.key === "failed" ? (
              <p className="text-xs text-muted-foreground">Veja o motivo em Publicações</p>
            ) : null}
          </div>
        </div>
      ))}
    </SettingsGroup>
  );
}

function SkippedList({ skipped }: { skipped: readonly BulkPublishSkip[] }) {
  if (skipped.length === 0) {
    return null;
  }
  const { shown, hidden } = skippedDetails(skipped, SKIPPED_SHOWN);
  return (
    <SettingsGroup title="Ficaram fora">
      <ul className="divide-y divide-border">
        {shown.map((item) => (
          <li key={item.productId} className="truncate px-3.5 py-2 text-sm">
            {item.text}
          </li>
        ))}
        {hidden > 0 ? (
          <li className="px-3.5 py-2 text-xs text-muted-foreground">e mais {hidden}</li>
        ) : null}
      </ul>
    </SettingsGroup>
  );
}

/** Usually the poll answers first; until then the batch reads as all still going. */
function useBatchTally(batch: PublishedBatch) {
  const query = useQuery(bulkPublishProgressQueryOptions(batch.targetIds));
  const total = batch.targetIds.length;
  const data = query.data;
  const tally: BulkPublishTally = {
    published: data?.published ?? 0,
    failed: data?.failed ?? 0,
    pending: data?.pending ?? total,
    skipped: batch.skipped,
  };
  const progress =
    data?.progress ??
    estimatePublishProgress({ total, finished: 0, startedAt: null, lastFinishedAt: null });
  return { tally, progress, readFailed: query.isError };
}

/**
 * The dialog after "Publicar": the bar with the time left while the marketplace works, then
 * the honest end — live, failed and left out (item 14.c). Closing early stops nothing.
 */
export function BulkPublishResult({
  batch,
  onClose,
}: {
  batch: PublishedBatch;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { tally, progress, readFailed } = useBatchTally(batch);
  const running = tally.pending > 0;
  return (
    <div className="space-y-5">
      <ProgressWithEta progress={progress} label="Andamento da publicação" />
      <OutcomeRows tally={tally} />
      <SkippedList skipped={batch.skipped} />
      {readFailed ? (
        <p role="alert" className="text-sm text-destructive">
          Não deu para ler o andamento agora. Os anúncios continuam sendo publicados.
        </p>
      ) : null}
      <div className="space-y-2">
        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={async () => {
            onClose();
            await navigate({ to: "/publicacoes" });
          }}
        >
          Ver publicações
        </Button>
        <Button type="button" size="lg" variant="ghost" className="w-full" onClick={onClose}>
          Fechar
        </Button>
        {running ? (
          <p className="text-center text-xs text-muted-foreground">
            Pode fechar: a publicação continua.
          </p>
        ) : null}
      </div>
    </div>
  );
}
