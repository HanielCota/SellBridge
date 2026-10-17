import { CaretDownIcon, DownloadSimpleIcon } from "@phosphor-icons/react";
import { IMPORT_COLUMNS } from "@sellbridge/shared/supplier-panel-import-columns";
import { SectionCard } from "@/components/layout/section-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadCsv } from "@/features/supplier-panel/import/import-file";
import type { SupplierImportState } from "@/features/supplier-panel/import/use-supplier-import";
import { errorMessage } from "@/lib/errors";

/**
 * The model to fill and what each column takes. Categories are the platform's own (the
 * Mercado Livre attributes a listing needs are checked when it is published, not here).
 */
export function ImportTemplatePanel({ files }: { files: SupplierImportState["files"] }) {
  const data = files.data;
  return (
    <SectionCard
      title="Modelo"
      description="Reenviar a planilha atualiza os produtos pelo SKU, sem duplicar."
    >
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={data === undefined}
            onClick={() => data && downloadCsv("modelo-produtos.csv", data.templateCsv)}
          >
            <DownloadSimpleIcon aria-hidden="true" />
            Baixar modelo
          </Button>
          <Button
            variant="ghost"
            disabled={data === undefined}
            onClick={() => data && downloadCsv("guia-colunas.csv", data.guideCsv)}
          >
            Baixar guia
          </Button>
        </div>
        {files.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(files.error)}
          </p>
        ) : null}
        <dl className="divide-y divide-border text-sm">
          {IMPORT_COLUMNS.map((entry) => (
            <div key={entry.column} className="grid gap-0.5 py-2.5 first:pt-0">
              <dt className="flex items-center gap-2">
                <span className="font-mono text-footnote font-medium">{entry.column}</span>
                {entry.required ? (
                  <span className="text-caption text-muted-foreground">obrigatória</span>
                ) : null}
              </dt>
              <dd className="text-muted-foreground">{entry.format}</dd>
            </div>
          ))}
        </dl>
        <CategoryList files={files} />
      </div>
    </SectionCard>
  );
}

function CategoryList({ files }: { files: SupplierImportState["files"] }) {
  if (files.isPending) {
    return <Skeleton className="h-16 w-full rounded-2xl" />;
  }
  const categories = files.data?.categories ?? [];
  return (
    <details className="group text-sm">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-md font-medium select-none outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        Categorias aceitas
        <span className="text-muted-foreground tabular-nums">{categories.length}</span>
        <CaretDownIcon
          className="size-3.5 motion-safe:transition-transform motion-safe:duration-200 group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <ul className="mt-2 space-y-1 text-muted-foreground">
        {categories.map((category) => (
          <li key={category.slug}>
            {category.name}: <code className="font-mono text-footnote">{category.slug}</code>
          </li>
        ))}
        {categories.length === 0 ? (
          <li>Nenhuma categoria cadastrada; deixe a coluna vazia.</li>
        ) : null}
      </ul>
    </details>
  );
}
