import { CheckCircleIcon, DownloadSimpleIcon, TableIcon } from "@phosphor-icons/react";
import type { SupplierImportResult } from "@sellbridge/shared/supplier-panel-import-schemas";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type SupplierImportState,
  useSupplierImport,
} from "@/features/supplier-panel/import/use-supplier-import";
import { downloadCsv, failedRowsFileName } from "@/features/supplier-panel/import/import-file";
import { errorMessage } from "@/lib/errors";
import { ImportDropZone } from "./import-drop-zone";
import { ImportIssueList } from "./import-issue-list";
import { ImportPreviewSummary } from "./import-preview-summary";
import { ImportTemplatePanel } from "./import-template-panel";

const count = new Intl.NumberFormat("pt-BR");

interface LeftOut {
  readonly rows: number;
  readonly csv: string;
  readonly fileName: string;
}

function ImportDone(props: {
  result: SupplierImportResult;
  leftOut: LeftOut | null;
  onAgain: () => void;
}) {
  const { result, leftOut } = props;
  const paused =
    result.pausedTargets > 0
      ? ` ${count.format(result.pausedTargets)} anúncios pausados sem estoque.`
      : "";
  return (
    <output className="surface-card flex flex-col items-center gap-3 rounded-3xl bg-card px-6 py-12 text-center">
      <CheckCircleIcon
        className="size-8 text-emerald-600 dark:text-emerald-500"
        weight="light"
        aria-hidden="true"
      />
      <div className="max-w-md space-y-1">
        <h2 className="text-subhead font-medium">Importação concluída</h2>
        <p className="text-sm text-muted-foreground">
          {count.format(result.created)} criados e {count.format(result.updated)} atualizados.
          {result.synchronizationQueued
            ? " Estoque enviado aos marketplaces."
            : " O estoque vai aos marketplaces na próxima sincronização."}
          {paused}
          {leftOut === null
            ? null
            : ` ${count.format(leftOut.rows)} linhas com erro ficaram de fora; corrija e envie de novo.`}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {leftOut === null ? null : (
          <Button onClick={() => downloadCsv(failedRowsFileName(leftOut.fileName), leftOut.csv)}>
            <DownloadSimpleIcon aria-hidden="true" />
            Baixar erros
          </Button>
        )}
        <Button variant="outline" onClick={props.onAgain}>
          Importar outra
        </Button>
      </div>
    </output>
  );
}

function leftOutRows(state: SupplierImportState): LeftOut | null {
  const preview = state.preview.data;
  if (preview === undefined || preview.failedRows === 0) {
    return null;
  }
  return { rows: preview.failedRows, csv: preview.failedRowsCsv, fileName: state.file?.name ?? "" };
}

function PreviewArea({ state }: { state: SupplierImportState }) {
  if (state.preview.isPending) {
    return <Skeleton className="h-56 w-full rounded-3xl" aria-label="Conferindo a planilha" />;
  }
  if (state.error !== null) {
    return <ErrorState message={state.error} />;
  }
  const preview = state.preview.data;
  if (preview === undefined) {
    return (
      <EmptyState
        icon={TableIcon}
        title="Prévia"
        description="As linhas da planilha aparecem aqui antes de entrar no catálogo."
      />
    );
  }
  return (
    <div className="space-y-4">
      <ImportPreviewSummary
        preview={preview}
        fileName={state.file?.name ?? "produtos"}
        importing={state.apply.isPending}
        onConfirm={state.confirm}
      />
      {state.apply.isError ? <ErrorState message={errorMessage(state.apply.error)} /> : null}
      {preview.issues.length > 0 ? <ImportIssueList rows={preview.issues} /> : null}
    </div>
  );
}

/**
 * The supplier's bulk product import: drop a spreadsheet, see each problem by line and column,
 * import the valid rows on purpose, download the failed ones to fix. `supplierId` comes from
 * the route, which decides who may act for that supplier.
 */
export function SupplierProductImport({ supplierId }: { supplierId: string }) {
  const state = useSupplierImport(supplierId);
  const busy = state.preview.isPending || state.apply.isPending;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
      <div className="min-w-0 space-y-4">
        {state.apply.isSuccess ? (
          <ImportDone
            result={state.apply.data}
            leftOut={leftOutRows(state)}
            onAgain={state.reset}
          />
        ) : (
          <>
            <ImportDropZone
              file={state.file}
              busy={busy}
              onChoose={(file) => void state.chooseFile(file)}
            />
            <PreviewArea state={state} />
          </>
        )}
      </div>
      <ImportTemplatePanel files={state.files} />
    </div>
  );
}
