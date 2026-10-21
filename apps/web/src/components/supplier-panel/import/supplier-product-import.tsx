import { CheckCircleIcon, TableIcon } from "@phosphor-icons/react";
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
import { importDoneSummary } from "@/features/supplier-panel/import/import-wording";
import { errorMessage } from "@/lib/errors";
import { ImportDropZone } from "./import-drop-zone";
import { ImportIssueList } from "./import-issue-list";
import { ImportPreviewSummary } from "./import-preview-summary";
import { ImportTemplatePanel } from "./import-template-panel";
import { ACTION_ICONS, CONTROL_HINTS } from "@/components/icons/action-icons";
import { Hint } from "@/components/ui/hint";

interface LeftOut {
  readonly rows: number;
  readonly csv: string;
  readonly fileName: string;
}

const DownloadIcon = ACTION_ICONS.downloadFile.icon;

function ImportDone(props: {
  result: SupplierImportResult;
  leftOut: LeftOut | null;
  onAgain: () => void;
}) {
  const { result, leftOut } = props;
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
          {importDoneSummary(result, leftOut?.rows ?? 0)}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {leftOut === null ? null : (
          <Hint label={CONTROL_HINTS.downloadErrors} openOnTap={false}>
            <Button onClick={() => downloadCsv(failedRowsFileName(leftOut.fileName), leftOut.csv)}>
              <DownloadIcon aria-hidden="true" />
              Baixar erros
            </Button>
          </Hint>
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
