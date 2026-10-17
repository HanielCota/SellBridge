import { DownloadSimpleIcon } from "@phosphor-icons/react";
import type { SupplierImportPreview } from "@sellbridge/shared/supplier-panel-import-schemas";
import { useState } from "react";
import { ToneStatus } from "@/components/data/tone-status";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { downloadCsv, failedRowsFileName } from "@/features/supplier-panel/import/import-file";
import {
  confirmDescription,
  onlyValidLabel,
  plural,
} from "@/features/supplier-panel/import/import-wording";

const count = new Intl.NumberFormat("pt-BR");

function Figure({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  return (
    <div className="rounded-2xl bg-surface-grouped px-4 py-3">
      <dt className="text-footnote text-muted-foreground">{label}</dt>
      <dd
        className={
          tone === "danger" && value > 0
            ? "text-[26px] font-semibold text-destructive tabular-nums"
            : "text-[26px] font-semibold tabular-nums"
        }
      >
        {count.format(value)}
      </dd>
    </div>
  );
}

function fileDescription(file: SupplierImportPreview["file"]): string {
  if (file.format === "xlsx") {
    return "Excel, primeira aba";
  }
  return `CSV ${file.encodingLabel ?? "UTF-8"}, separado por ${file.delimiterLabel ?? "ponto e vírgula"}`;
}

function SummaryHeader({ preview }: { preview: SupplierImportPreview }) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-subhead font-semibold">
            {plural(preview.validRows, "válida", "válidas")},{" "}
            {plural(preview.failedRows, "com erro", "com erro")}
          </h2>
          <p className="text-sm text-muted-foreground">{fileDescription(preview.file)}</p>
        </div>
        {preview.failedRows > 0 ? (
          <ToneStatus tone="warning" label="Com erros" />
        ) : (
          <ToneStatus tone="success" label="Sem erros" />
        )}
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure label="Linhas" value={preview.totalRows} />
        <Figure label="Produtos novos" value={preview.created} />
        <Figure label="Atualizados" value={preview.updated} />
        <Figure label="Com erro" value={preview.failedRows} tone="danger" />
      </dl>
    </>
  );
}

function OnlyValidChoice(props: {
  preview: SupplierImportPreview;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const { preview } = props;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-field-border p-4">
      <Checkbox
        id="import-only-valid"
        checked={props.checked}
        onCheckedChange={(checked) => props.onChange(checked === true)}
      />
      <Label htmlFor="import-only-valid" className="block text-sm leading-snug font-normal">
        {onlyValidLabel(preview.validRows, preview.failedRows)}
      </Label>
    </div>
  );
}

interface ImportPreviewSummaryProps {
  preview: SupplierImportPreview;
  fileName: string;
  importing: boolean;
  onConfirm: () => void;
}

/**
 * What the file holds and what importing will do. With failed rows, importing the rest is an
 * explicit choice (the box), and the failed rows stay one click away to fix and send again.
 */
export function ImportPreviewSummary(props: ImportPreviewSummaryProps) {
  const { preview } = props;
  const [onlyValid, setOnlyValid] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const partial = preview.failedRows > 0;
  const canImport = preview.confirmation !== null && (!partial || onlyValid);
  return (
    <section aria-label="Prévia" className="surface-card space-y-5 rounded-3xl bg-card p-5 sm:p-6">
      <SummaryHeader preview={preview} />
      {partial && preview.confirmation !== null ? (
        <OnlyValidChoice preview={preview} checked={onlyValid} onChange={setOnlyValid} />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={!canImport || props.importing} onClick={() => setConfirming(true)}>
          {preview.confirmation === null
            ? "Importar"
            : `Importar ${plural(preview.validRows, "produto", "produtos")}`}
        </Button>
        {partial ? (
          <Button
            variant="outline"
            onClick={() => downloadCsv(failedRowsFileName(props.fileName), preview.failedRowsCsv)}
          >
            <DownloadSimpleIcon aria-hidden="true" />
            Baixar erros
          </Button>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Importar ${plural(preview.validRows, "produto", "produtos")}?`}
        description={confirmDescription(preview)}
        confirmLabel="Importar"
        pendingLabel="Importando…"
        isPending={props.importing}
        onConfirm={() => {
          setConfirming(false);
          props.onConfirm();
        }}
      />
    </section>
  );
}
