import { CheckCircleIcon } from "@phosphor-icons/react";
import { emojisRemovedNotice } from "@sellbridge/shared/emoji";
import { ErrorState } from "@/components/feedback/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BLING_OUTCOME_MESSAGES,
  type BlingConnectOutcome,
} from "@/features/supplier-panel/bling/bling-connection";
import type {
  BlingImportOutcome,
  BlingOverview,
} from "@/features/supplier-panel/bling/bling-overview";
import { downloadCsv } from "@/features/supplier-panel/import/import-file";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { BlingConnectCard, BlingConnectedCard, BlingReconnectCard } from "./bling-card";
import { BlingPreview } from "./bling-preview";

const integer = new Intl.NumberFormat("pt-BR");

function OutcomeNotice({ outcome }: { outcome: BlingConnectOutcome }) {
  const message = BLING_OUTCOME_MESSAGES[outcome];
  return (
    <p
      role={message.ok ? "status" : "alert"}
      className={cn(
        "rounded-2xl px-4 py-3 text-sm font-medium",
        message.ok
          ? "bg-emerald-500/14 text-emerald-800 dark:text-emerald-300"
          : "bg-destructive/10 text-destructive",
      )}
    >
      {message.text}
    </p>
  );
}

function ImportDone({ outcome, onBack }: { outcome: BlingImportOutcome; onBack: () => void }) {
  return (
    <output className="surface-card flex flex-col items-center gap-3 rounded-3xl bg-card px-6 py-10 text-center">
      <CheckCircleIcon
        className="size-8 text-emerald-600 dark:text-emerald-500"
        weight="light"
        aria-hidden="true"
      />
      <div className="max-w-md space-y-1">
        <h2 className="text-subhead font-medium">Importação do Bling concluída</h2>
        <p className="text-sm text-muted-foreground">
          {integer.format(outcome.created)} novos e {integer.format(outcome.updated)} atualizados.
          {outcome.failedRows > 0
            ? ` ${integer.format(outcome.failedRows)} ficaram de fora: baixe a lista para ver o motivo de cada um.`
            : ""}
          {emojisRemovedNotice(outcome.emojisRemoved) === null
            ? ""
            : ` ${emojisRemovedNotice(outcome.emojisRemoved)}`}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {outcome.failedRows > 0 ? (
          <Button
            size="lg"
            onClick={() => downloadCsv("bling-produtos-com-erro.csv", outcome.failedRowsCsv)}
          >
            Baixar os que ficaram de fora
          </Button>
        ) : null}
        <Button variant="outline" size="lg" onClick={onBack}>
          Voltar
        </Button>
      </div>
    </output>
  );
}

function ConnectionArea(props: {
  supplierId: string;
  overview: BlingOverview;
  onImported: (outcome: BlingImportOutcome) => void;
}) {
  const { connection, read } = props.overview;
  if (connection === null) {
    return <BlingConnectCard supplierId={props.supplierId} />;
  }
  if (connection.status !== "connected") {
    return <BlingReconnectCard supplierId={props.supplierId} connection={connection} />;
  }
  if (read?.status === "ready") {
    return (
      <BlingPreview
        supplierId={props.supplierId}
        readId={read.id}
        savedTenths={connection.resellerDiscountTenths}
        onImported={props.onImported}
      />
    );
  }
  return <BlingConnectedCard supplierId={props.supplierId} connection={connection} read={read} />;
}

/**
 * The Bling part of the import page: hidden while the feature is off, then connect, import with
 * a preview, or the outcome of the last import.
 */
export function BlingSection(props: {
  supplierId: string;
  overview: {
    data: BlingOverview | undefined;
    isPending: boolean;
    isError: boolean;
    error: unknown;
  };
  outcome: BlingConnectOutcome | undefined;
  lastImport: BlingImportOutcome | null;
  onImported: (outcome: BlingImportOutcome) => void;
  onDismissImport: () => void;
}) {
  if (props.overview.isPending) {
    return <Skeleton className="h-40 w-full rounded-3xl" aria-label="Carregando o Bling" />;
  }
  if (props.overview.isError) {
    return <ErrorState message={errorMessage(props.overview.error)} />;
  }
  const overview = props.overview.data;
  if (overview === undefined || !overview.available) {
    return null;
  }
  return (
    <div className="grid gap-4">
      {props.outcome === undefined ? null : <OutcomeNotice outcome={props.outcome} />}
      {props.lastImport === null ? (
        <ConnectionArea
          supplierId={props.supplierId}
          overview={overview}
          onImported={props.onImported}
        />
      ) : (
        <ImportDone outcome={props.lastImport} onBack={props.onDismissImport} />
      )}
    </div>
  );
}
