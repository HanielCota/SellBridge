import { CaretDownIcon } from "@phosphor-icons/react";
import { findSourceLine, SPREADSHEET_KIND_LABEL } from "@sellbridge/shared/catalog-spreadsheet";
import { PRODUCT_CSV_TEMPLATE, type ProductCsvError } from "@sellbridge/shared/product-csv";
import { useRef } from "react";
import { createServerColumnHelper, DataTable } from "@/components/data/data-table";
import { SectionCard } from "@/components/layout/section-card";
import { FormErrorAlert } from "@/components/form/form-feedback";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { pausedListingsLabel } from "@/features/admin-suppliers/catalog-status";
import { useProductCsv, type SpreadsheetSummary } from "@/features/admin-suppliers/use-product-csv";
import { errorMessage } from "@/lib/errors";
import { ACTION_ICONS } from "@/components/icons/action-icons";

interface ImportError extends ProductCsvError {
  readonly location: string;
}

const columnHelper = createServerColumnHelper<ImportError>();
const errorColumns = columnHelper.columns([
  columnHelper.accessor("location", { header: "Linha" }),
  columnHelper.accessor("reason", { header: "Motivo" }),
]);

/** Spreadsheet imports report the original sheet row and SKU instead of the generated CSV line. */
function locateErrors(
  errors: readonly ProductCsvError[],
  summary: SpreadsheetSummary | null,
): ImportError[] {
  return errors.map((error) => {
    const source = summary == null ? null : findSourceLine(summary.lines, error.line);
    if (source == null) {
      return { ...error, location: String(error.line) };
    }
    return { ...error, location: `${source.source}, linha ${source.rowNumber} (${source.sku})` };
  });
}

function SpreadsheetSummaryNotice({ summary }: { summary: SpreadsheetSummary }) {
  const unmatched = summary.unmatchedListingSkus;
  return (
    <Alert>
      <AlertDescription className="space-y-2">
        <ul className="list-disc space-y-1 pl-4">
          {summary.sources.map((source) => (
            <li key={source.source}>
              {SPREADSHEET_KIND_LABEL[source.kind]}: {source.source}
            </li>
          ))}
        </ul>
        <p>
          {summary.productCount} produtos lidos da planilha do fornecedor; {summary.enrichedCount}{" "}
          completados com preço, título, descrição e imagens da Shopee.
        </p>
        {unmatched.length > 0 ? (
          <details>
            <summary className="cursor-pointer">
              {unmatched.length} SKUs da Shopee não existem no catálogo do fornecedor e serão
              ignorados
            </summary>
            <p className="mt-2 break-words font-mono text-xs">{unmatched.join(", ")}</p>
          </details>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

const DownloadIcon = ACTION_ICONS.downloadFile.icon;
const ChooseFileIcon = ACTION_ICONS.importProducts.icon;

function CsvPreview({ importer }: { importer: ReturnType<typeof useProductCsv> }) {
  const result = importer.preview.data;
  if (!result) {
    return (
      <p className="text-sm text-muted-foreground">
        Selecione um arquivo e gere a prévia antes de importar.
      </p>
    );
  }
  return (
    <div className="space-y-4" aria-live="polite">
      <Alert>
        <AlertDescription>
          {result.created} produtos serão criados e {result.updated} atualizados.{" "}
          {result.errors.length} linhas com erro.
        </AlertDescription>
      </Alert>
      {result.errors.length > 0 ? (
        <>
          <FormErrorAlert message="Corrija todas as linhas com erro e selecione o arquivo novamente. Nenhum produto será importado enquanto houver erros." />
          <DataTable
            columns={errorColumns}
            data={locateErrors(result.errors, importer.summary)}
            caption="Erros da importação"
            getRowId={(row) => String(row.line)}
            renderMobileRow={(row) => (
              <p>
                <strong>Linha {row.location}:</strong> {row.reason}
              </p>
            )}
          />
        </>
      ) : null}
      <Button
        disabled={
          result.errors.length > 0 ||
          importer.apply.isPending ||
          importer.preview.isPending ||
          importer.isReading
        }
        onClick={importer.confirm}
      >
        {importer.apply.isPending ? "Importando…" : "Confirmar importação"}
      </Button>
    </div>
  );
}

function CsvInstructions({ categories }: { categories: { name: string; slug: string }[] }) {
  return (
    <div className="space-y-3">
      {" "}
      <Button asChild variant="outline">
        <a
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(PRODUCT_CSV_TEMPLATE)}`}
          download="modelo-produtos.csv"
        >
          <DownloadIcon aria-hidden="true" />
          Baixar modelo CSV
        </a>
      </Button>
      <p className="text-sm text-muted-foreground">
        Planilhas .xlsx: envie o catálogo do fornecedor exportado da EnvioVelox (SKU, Nome produto,
        Preço de venda, Estoque) e, se quiser, a planilha de anúncios da Shopee junto. O custo vem
        do Preço de custo ou, se estiver zerado, do Preço de venda do fornecedor; pelo SKU, a Shopee
        completa preço sugerido, título, descrição e imagens.
      </p>
      <p className="text-sm text-muted-foreground">
        CSV: use custo em reais (12,90 ou 12.90), categoria pelo identificador abaixo e imagens
        separadas por |. Ativo aceita sim ou nao; vazio mantém o status atual. Sem preço sugerido, o
        valor atual é mantido; novos produtos usam acréscimo de 50% e final ,90.
      </p>
      <p className="text-sm text-muted-foreground">
        Para o Mercado Livre, preencha marca, modelo e gtin (código de barras com 8, 12, 13 ou 14
        dígitos), o peso da embalagem em gramas (peso_g) e as medidas em centímetros (altura_cm,
        largura_cm, comprimento_cm). Muitas categorias recusam o anúncio sem marca e modelo. Uma
        célula vazia mantém o valor que o produto já tem.
      </p>
      <details className="group text-sm">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg font-medium outline-none focus-visible:ring-4 focus-visible:ring-ring/30 [&::-webkit-details-marker]:hidden">
          Categorias disponíveis
          <CaretDownIcon
            className="size-3.5 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </summary>
        <ul className="mt-2 space-y-1">
          {categories.map((category) => (
            <li key={category.slug}>
              {category.name}: <code>{category.slug}</code>
            </li>
          ))}
          {categories.length === 0 ? (
            <li>Sem categorias cadastradas. Deixe a coluna vazia.</li>
          ) : null}
        </ul>
      </details>
    </div>
  );
}

/** The app's own button over a hidden picker: the native one follows the OS, not the app. */
function CsvFileField({
  pending,
  fileName,
  onSelect,
}: {
  pending: boolean;
  fileName: string;
  onSelect: (files: FileList | null) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <div className="grid gap-2">
      <Label htmlFor="product-csv">Arquivo CSV (UTF-8) ou planilhas .xlsx</Label>
      <input
        ref={fileInput}
        id="product-csv"
        type="file"
        multiple
        accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        disabled={pending}
        onChange={(event) => onSelect(event.target.files)}
      />
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => fileInput.current?.click()}
        >
          <ChooseFileIcon aria-hidden="true" />
          Escolher arquivos
        </Button>
        <span className="min-w-0 truncate text-sm text-muted-foreground">
          {fileName || "Nenhum arquivo escolhido"}
        </span>
      </div>
    </div>
  );
}

export function ProductCsvImport({
  supplierId,
  categories,
}: {
  supplierId: string;
  categories: { name: string; slug: string }[];
}) {
  const importer = useProductCsv(supplierId, categories);
  const pending = importer.isReading || importer.preview.isPending || importer.apply.isPending;
  const error =
    importer.fileError ??
    (importer.preview.isError ? errorMessage(importer.preview.error) : null) ??
    (importer.apply.isError ? errorMessage(importer.apply.error) : null);
  return (
    <SectionCard
      title="Importar produtos"
      description="CSV ou planilhas .xlsx, até 1.000 produtos. Códigos existentes serão atualizados; toda a importação será aplicada de uma vez."
    >
      <div className="space-y-4" aria-busy={pending}>
        <CsvInstructions categories={categories} />
        <CsvFileField
          pending={pending}
          fileName={importer.fileName}
          onSelect={(files) => void importer.selectFiles(files)}
        />
        {importer.summary ? <SpreadsheetSummaryNotice summary={importer.summary} /> : null}
        <Button
          variant="secondary"
          disabled={!importer.canPreview || pending}
          onClick={importer.generatePreview}
        >
          {pending ? "Processando…" : "Gerar prévia"}
        </Button>
        <FormErrorAlert message={error} />
        {importer.apply.isSuccess ? (
          <Alert>
            <AlertDescription>
              Importação concluída: {importer.apply.data.created} criados e{" "}
              {importer.apply.data.updated} atualizados
              {importer.apply.data.pausedTargets > 0
                ? ` · ${pausedListingsLabel(importer.apply.data.pausedTargets)}`
                : null}
              .
            </AlertDescription>
          </Alert>
        ) : null}
        <CsvPreview importer={importer} />
      </div>
    </SectionCard>
  );
}
