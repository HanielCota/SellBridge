import { emojisRemovedNotice } from "@sellbridge/shared/emoji";
import { stockCappedNotice } from "@sellbridge/shared/product-csv";
import { resellerPriceAboveSuggestedWarning } from "@sellbridge/shared/reseller-price-warning";
import type {
  ImportPriceWarning,
  SupplierImportPreview,
} from "@sellbridge/shared/supplier-panel-import-schemas";
import { useState, type ReactNode } from "react";
import { ToneStatus } from "@/components/data/tone-status";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { downloadCsv, failedRowsFileName } from "@/features/supplier-panel/import/import-file";
import {
  confirmDescription,
  importActionLabel,
  importNeedsConfirmation,
  onlyValidLabel,
  plural,
} from "@/features/supplier-panel/import/import-wording";
import { ACTION_ICONS, CONTROL_HINTS, TERM_HINTS } from "@/components/icons/action-icons";
import { DisabledHint, Hint, HintedText } from "@/components/ui/hint";

const count = new Intl.NumberFormat("pt-BR");
const DownloadIcon = ACTION_ICONS.downloadFile.icon;
/** Price warnings listed at once; a file full of them shows the first ones and the count. */
const SHOWN_PRICE_WARNINGS = 10;

function Figure({ label, value, tone }: { label: ReactNode; value: number; tone?: "danger" }) {
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

function EmojiNotice({ products }: { products: number }) {
  const notice = emojisRemovedNotice(products);
  if (notice === null) {
    return null;
  }
  return <p className="text-sm text-muted-foreground">{notice}</p>;
}

function StockCappedNotice({ codes }: { codes: readonly string[] }) {
  const notice = stockCappedNotice(codes);
  if (notice === null) {
    return null;
  }
  return <p className="text-sm text-muted-foreground">{notice}</p>;
}

/** Rows whose cost is above their suggested price: they import, the supplier just sees why. */
function PriceWarnings({ warnings }: { warnings: readonly ImportPriceWarning[] }) {
  if (warnings.length === 0) {
    return null;
  }
  const hidden = warnings.length - SHOWN_PRICE_WARNINGS;
  return (
    <div className="space-y-2 rounded-2xl border border-amber-700/40 p-4 text-sm">
      <p className="font-medium text-amber-700 dark:text-amber-500">
        {plural(warnings.length, "produto com custo", "produtos com custo")} acima do preço
        sugerido. {warnings.length === 1 ? "Ele importa" : "Eles importam"} assim mesmo; confira
        antes.
      </p>
      <ul className="space-y-1 text-muted-foreground">
        {warnings.slice(0, SHOWN_PRICE_WARNINGS).map((warning) => (
          <li key={warning.line}>
            Linha {count.format(warning.line)} · {warning.sku}:{" "}
            {resellerPriceAboveSuggestedWarning(warning.costCents, warning.suggestedPriceCents)}
          </li>
        ))}
        {hidden > 0 ? <li>E mais {plural(hidden, "produto", "produtos")}.</li> : null}
      </ul>
    </div>
  );
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
        <Figure
          label={
            <HintedText label={TERM_HINTS.failedRows} className="hinted-term">
              Com erro
            </HintedText>
          }
          value={preview.failedRows}
          tone="danger"
        />
      </dl>
      <GridNotices
        grids={preview.grids}
        combinations={preview.gridCombinations}
        notices={preview.notices}
      />
      <EmojiNotice products={preview.emojisRemoved} />
      <StockCappedNotice codes={preview.stockCapped} />
      <PriceWarnings warnings={preview.priceWarnings} />
    </>
  );
}

// The grids the file creates, and the rows that went in as separate products instead.
function GridNotices({
  grids,
  combinations,
  notices,
}: {
  grids: number;
  combinations: number;
  notices: SupplierImportPreview["notices"];
}) {
  if (grids === 0 && notices.length === 0) {
    return null;
  }
  return (
    <div className="space-y-2 text-sm">
      {grids > 0 ? (
        <p className="text-muted-foreground">
          {plural(grids, "produto com cores e tamanhos", "produtos com cores e tamanhos")}, com{" "}
          {plural(combinations, "variação", "variações")}. Cada linha vira uma variação dele, e na
          lista de produtos ele aparece uma vez só.
        </p>
      ) : null}
      {notices.length > 0 ? (
        <ul className="space-y-1 rounded-2xl border border-amber-700/40 p-4 text-muted-foreground">
          {notices.map((notice) => (
            <li key={notice.line}>
              Linha {count.format(notice.line)}: {notice.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
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

function importButtonLabel(preview: SupplierImportPreview, importing: boolean): string {
  if (importing) {
    return "Importando…";
  }
  return preview.confirmation === null ? "Importar" : importActionLabel(preview);
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
        <DisabledHint reason={partial && !onlyValid ? CONTROL_HINTS.importNeedsChoice : undefined}>
          <Button
            disabled={!canImport || props.importing}
            onClick={() => {
              if (importNeedsConfirmation(preview)) {
                setConfirming(true);
                return;
              }
              props.onConfirm();
            }}
          >
            {importButtonLabel(preview, props.importing)}
          </Button>
        </DisabledHint>
        {partial ? (
          <Hint label={CONTROL_HINTS.downloadErrors} openOnTap={false}>
            <Button
              variant="outline"
              onClick={() => downloadCsv(failedRowsFileName(props.fileName), preview.failedRowsCsv)}
            >
              <DownloadIcon aria-hidden="true" />
              Baixar erros
            </Button>
          </Hint>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`${importActionLabel(preview)}?`}
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
