import { CaretDownIcon } from "@phosphor-icons/react";
import type { ImportColumnGuide } from "@sellbridge/shared/supplier-panel-import-columns";
import type { ReactNode } from "react";
import { ACTION_ICONS } from "@/components/icons/action-icons";
import { SectionCard } from "@/components/layout/section-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { importColumnSections } from "@/features/supplier-panel/import/import-column-groups";
import { downloadCsv } from "@/features/supplier-panel/import/import-file";
import type { SupplierImportState } from "@/features/supplier-panel/import/use-supplier-import";

type Files = SupplierImportState["files"];

const DownloadIcon = ACTION_ICONS.downloadFile.icon;
const count = new Intl.NumberFormat("pt-BR");

function ColumnRows({ columns }: { columns: readonly ImportColumnGuide[] }) {
  return (
    <dl className="divide-y divide-border text-sm">
      {columns.map((entry) => (
        <div key={entry.column} className="grid gap-0.5 py-2 first:pt-0">
          {/* The word first, the header to look for in the spreadsheet after it. */}
          <dt className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium">{entry.label}</span>
            <span className="font-mono text-footnote text-muted-foreground">
              coluna {entry.column}
            </span>
          </dt>
          <dd className="text-muted-foreground">{entry.format}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A closed group of the panel: the title and how many it holds, the list one tap away. */
function Disclosure(props: { title: string; amount: ReactNode; children: ReactNode }) {
  return (
    <details className="group border-t border-border">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md text-sm select-none outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="font-medium">{props.title}</span>{" "}
          <span className="text-muted-foreground">{props.amount}</span>
        </span>
        <CaretDownIcon
          className="size-4 flex-none text-muted-foreground motion-safe:transition-transform motion-safe:duration-200 group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="pt-1 pb-3">{props.children}</div>
    </details>
  );
}

function columnAmount(amount: number): string {
  return `${count.format(amount)} ${amount === 1 ? "coluna" : "colunas"}`;
}

function CategoryList({ files }: { files: Files }) {
  if (files.isPending) {
    return <Skeleton className="h-11 w-full rounded-2xl" />;
  }
  const categories = files.data?.categories ?? [];
  return (
    <Disclosure title="Categorias aceitas" amount={count.format(categories.length)}>
      <ul className="space-y-1 text-sm text-muted-foreground">
        {categories.map((category) => (
          <li key={category.slug}>
            {category.name}: <code className="font-mono text-footnote">{category.slug}</code>
          </li>
        ))}
        {categories.length === 0 ? (
          <li>Nenhuma categoria cadastrada; deixe a coluna vazia.</li>
        ) : null}
      </ul>
    </Disclosure>
  );
}

function GuideDownload({ files }: { files: Files }) {
  const data = files.data;
  return (
    <Button
      variant="ghost"
      className="-ml-3"
      disabled={data === undefined}
      onClick={() => {
        if (data !== undefined) downloadCsv("guia-colunas.csv", data.guideCsv);
      }}
    >
      <DownloadIcon aria-hidden="true" />
      Baixar guia com todas as colunas
    </Button>
  );
}

/**
 * What each column of the template takes: the required ones always in sight, the others in
 * closed groups, so the panel ends near the upload. Categories are the platform's own (the
 * Mercado Livre attributes a listing needs are checked when it is published, not here).
 */
export function ImportTemplatePanel({ files }: { files: Files }) {
  const sections = importColumnSections(files.data?.gridColumns ?? false);
  return (
    <SectionCard
      title="Colunas da planilha"
      description="Só 4 colunas são obrigatórias. Reenviar a planilha atualiza os produtos pelo código, sem duplicar."
    >
      <div className="space-y-4">
        <section aria-label="Colunas obrigatórias" className="space-y-2">
          <h3 className="text-footnote font-medium text-muted-foreground">Obrigatórias</h3>
          <ColumnRows columns={sections.required} />
        </section>
        <div className="border-b border-border">
          {sections.optional.map((group) => (
            <Disclosure
              key={group.title}
              title={group.title}
              amount={columnAmount(group.columns.length)}
            >
              <ColumnRows columns={group.columns} />
            </Disclosure>
          ))}
          <CategoryList files={files} />
        </div>
        <GuideDownload files={files} />
      </div>
    </SectionCard>
  );
}
