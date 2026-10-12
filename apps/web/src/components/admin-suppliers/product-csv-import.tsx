import { PRODUCT_CSV_TEMPLATE, type ProductCsvError } from "@sellbridge/shared/product-csv";
import { createServerColumnHelper, DataTable } from "@/components/data/data-table";
import { SectionCard } from "@/components/layout/section-card";
import { FormErrorAlert } from "@/components/form/form-feedback";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProductCsv } from "@/features/admin-suppliers/use-product-csv";
import { errorMessage } from "@/lib/errors";

const columnHelper = createServerColumnHelper<ProductCsvError>();
const errorColumns = columnHelper.columns([
  columnHelper.accessor("line", { header: "Linha" }),
  columnHelper.accessor("reason", { header: "Motivo" }),
]);

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
            data={result.errors}
            caption="Erros da importação"
            getRowId={(row) => String(row.line)}
            renderMobileRow={(row) => (
              <p>
                <strong>Linha {row.line}:</strong> {row.reason}
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
        {importer.apply.isPending ? "Importando..." : "Confirmar importação"}
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
          Baixar modelo CSV
        </a>
      </Button>
      <p className="text-sm text-muted-foreground">
        Use custo em reais (12,90 ou 12.90), categoria pelo identificador abaixo e imagens separadas
        por |. Ativo aceita sim ou nao; vazio mantém o status atual. Sem preço sugerido, o valor
        atual é mantido; novos produtos usam acréscimo de 50% e final ,90.
      </p>
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Categorias disponíveis</summary>
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

export function ProductCsvImport({
  supplierId,
  categories,
}: {
  supplierId: string;
  categories: { name: string; slug: string }[];
}) {
  const importer = useProductCsv(supplierId);
  const pending = importer.isReading || importer.preview.isPending || importer.apply.isPending;
  const error =
    importer.fileError ??
    (importer.preview.isError ? errorMessage(importer.preview.error) : null) ??
    (importer.apply.isError ? errorMessage(importer.apply.error) : null);
  return (
    <SectionCard
      title="Importar produtos por CSV"
      description="Até 2 MiB e 1.000 produtos. SKUs existentes serão atualizados; toda a importação será aplicada de uma vez."
    >
      <div className="space-y-4" aria-busy={pending}>
        <CsvInstructions categories={categories} />
        <div className="grid gap-2">
          <Label htmlFor="product-csv">Arquivo CSV (UTF-8)</Label>
          <Input
            id="product-csv"
            type="file"
            accept=".csv,text/csv"
            disabled={pending}
            onChange={(event) => void importer.selectFile(event.target.files?.[0])}
          />
        </div>
        {importer.fileName ? (
          <p className="text-sm text-muted-foreground">{importer.fileName}</p>
        ) : null}
        <Button
          variant="secondary"
          disabled={!importer.canPreview || pending}
          onClick={importer.generatePreview}
        >
          {pending ? "Processando..." : "Gerar prévia"}
        </Button>
        <FormErrorAlert message={error} />
        {importer.apply.isSuccess ? (
          <Alert>
            <AlertDescription>
              Importação concluída: {importer.apply.data.created} criados e{" "}
              {importer.apply.data.updated} atualizados.
            </AlertDescription>
          </Alert>
        ) : null}
        <CsvPreview importer={importer} />
      </div>
    </SectionCard>
  );
}
