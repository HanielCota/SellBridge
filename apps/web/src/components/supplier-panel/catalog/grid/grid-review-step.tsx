import { parseCsvMoney } from "@sellbridge/shared/product-csv";
import type { CompletenessReport } from "@sellbridge/shared/supplier-panel-catalog-completeness";
import { Money } from "@/components/data/money";
import type { PanelFormValues } from "@/features/supplier-panel/catalog/draft-form";
import type { GridFormState } from "@/features/supplier-panel/catalog/grid/grid-form-state";
import { StatusNote, SubmitForReview, SummaryRow, type SubmitProps } from "../step-review";

const LIST_FORMAT = new Intl.ListFormat("pt-BR", { type: "conjunction" });

function countOf(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function totalStock(grid: GridFormState): number {
  return grid.combinations.reduce((sum, combination) => {
    const units = Number(combination.stock.trim());
    return Number.isInteger(units) && units > 0 ? sum + units : sum;
  }, 0);
}

/** "R$ 99,90" when every combination asks the same, "R$ 99,90 a R$ 119,90" otherwise. */
function PriceRange({ grid }: { grid: GridFormState }) {
  const prices = grid.combinations
    .map((combination) => parseCsvMoney(combination.suggestedPrice))
    .filter((cents) => cents !== null && cents > 0)
    .map((cents) => cents ?? 0);
  if (prices.length === 0) {
    return <>Não informado</>;
  }
  const lowest = Math.min(...prices);
  const highest = Math.max(...prices);
  if (lowest === highest) {
    return <Money cents={lowest} />;
  }
  return (
    <>
      <Money cents={lowest} /> a <Money cents={highest} />
    </>
  );
}

/**
 * The grid at a glance before publishing: "Publicar" puts every combination on sale at once,
 * and stays while a combination added later is still a draft.
 */
export function GridReviewStep({
  values,
  grid,
  modelCode,
  categoryName,
  status,
  hasDraftCombination,
  report,
  ...submit
}: Omit<SubmitProps, "blockingCount"> & {
  values: PanelFormValues;
  grid: GridFormState;
  /** The code the spreadsheet uses for this grid; null until the first save. */
  modelCode: string | null;
  categoryName: string | null;
  status: "approved" | "draft";
  hasDraftCombination: boolean;
  report: CompletenessReport;
}) {
  const colors = grid.colors.map((color) => color.name);
  const sizes = grid.sizes.map((size) => size.name);
  return (
    <div className="grid gap-6">
      <dl className="divide-y divide-border">
        <SummaryRow label="Categoria">{categoryName ?? "Não informado"}</SummaryRow>
        <SummaryRow label="Título">{values.title || "Não informado"}</SummaryRow>
        <SummaryRow label="Código do modelo (na planilha)">
          {modelCode ?? "Criado ao salvar"}
        </SummaryRow>
        <SummaryRow label="Cores">
          {colors.length === 0 ? "Sem cores" : LIST_FORMAT.format(colors)}
        </SummaryRow>
        <SummaryRow label="Tamanhos">
          {sizes.length === 0 ? "Sem tamanhos" : LIST_FORMAT.format(sizes)}
        </SummaryRow>
        <SummaryRow label="Combinações">
          {countOf(grid.combinations.length, "combinação", "combinações")}
        </SummaryRow>
        <SummaryRow label="Estoque">{countOf(totalStock(grid), "unidade", "unidades")}</SummaryRow>
        <SummaryRow label="Preço sugerido">
          <PriceRange grid={grid} />
        </SummaryRow>
        <SummaryRow label="Fotos">{values.imageUrls.length}</SummaryRow>
      </dl>
      <StatusNote status={status} />
      {hasDraftCombination ? (
        <SubmitForReview {...submit} blockingCount={report.blocking.length} />
      ) : null}
    </div>
  );
}
