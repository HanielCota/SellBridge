import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/features/supplier-panel/import/import-file";
import type { SupplierImportState } from "@/features/supplier-panel/import/use-supplier-import";
import { errorMessage } from "@/lib/errors";
import { ACTION_ICONS, CONTROL_HINTS } from "@/components/icons/action-icons";
import { Hint } from "@/components/ui/hint";

const DownloadIcon = ACTION_ICONS.downloadFile.icon;

function Step(props: { number: number; title: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-3">
      <span
        className="flex size-7 items-center justify-center rounded-full bg-foreground/[0.06] text-footnote font-semibold tabular-nums"
        aria-hidden="true"
      >
        {props.number}
      </span>
      <h3 className="self-center text-subhead font-medium">{props.title}</h3>
      <div className="col-span-2 sm:col-start-2 sm:col-span-1">{props.children}</div>
    </li>
  );
}

function TemplateDownloads({ files }: { files: SupplierImportState["files"] }) {
  const data = files.data;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Hint label={CONTROL_HINTS.downloadTemplate} openOnTap={false}>
          <Button
            variant="outline"
            disabled={data === undefined}
            onClick={() => {
              if (data !== undefined) downloadCsv("modelo-produtos.csv", data.templateCsv);
            }}
          >
            <DownloadIcon aria-hidden="true" />
            Baixar modelo
          </Button>
        </Hint>
        <Hint label={CONTROL_HINTS.downloadGuide} openOnTap={false}>
          <Button
            variant="ghost"
            disabled={data === undefined}
            onClick={() => {
              if (data !== undefined) downloadCsv("guia-colunas.csv", data.guideCsv);
            }}
          >
            Baixar guia
          </Button>
        </Hint>
      </div>
      {files.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(files.error)}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The spreadsheet path in the order a person follows it, so on a phone the template comes
 * before the upload instead of after it. `children` is the upload itself (step 3).
 */
export function ImportSteps(props: { files: SupplierImportState["files"]; children: ReactNode }) {
  return (
    <ol className="space-y-6" aria-label="Como importar pela planilha">
      <Step number={1} title="Baixe o modelo">
        <TemplateDownloads files={props.files} />
      </Step>
      <Step number={2} title="Preencha no Excel">
        <p className="text-sm text-muted-foreground">
          Uma linha por produto. O que vai em cada coluna está em “Colunas da planilha”.
        </p>
      </Step>
      <Step number={3} title="Envie a planilha">
        {props.children}
      </Step>
    </ol>
  );
}
