import { Button } from "@/components/ui/button";

function productsWord(count: number): string {
  return count === 1 ? "1 produto sem dados fiscais" : `${count} produtos sem dados fiscais`;
}

/** What to fill in: only the NCM when Marca already lends origin and unit to every product. */
function noticeText(filtering: boolean, brandHasFiscalDefaults: boolean): string {
  if (brandHasFiscalDefaults) {
    return filtering
      ? "Mostrando só estes. Abra cada um e preencha o NCM; origem e unidade vêm da Marca."
      : "Eles continuam à venda; preencha o NCM para poder emitir nota. Origem e unidade vêm da Marca.";
  }
  return filtering
    ? "Mostrando só estes. Abra cada um e preencha NCM, origem e unidade."
    : "Eles continuam à venda; complete para poder emitir nota. Produto novo só é publicado com NCM, origem e unidade.";
}

/**
 * Products from before the fiscal fields keep selling without NCM; the supplier completes them
 * from here. While the list shows only those, the notice offers the way back.
 */
export function MissingFiscalNotice({
  count,
  filtering,
  brandHasFiscalDefaults,
  onFilterChange,
}: {
  count: number;
  filtering: boolean;
  brandHasFiscalDefaults: boolean;
  onFilterChange: (filtering: boolean) => void;
}) {
  if (count === 0 && !filtering) {
    return null;
  }
  return (
    <section
      aria-label="Produtos sem dados fiscais"
      className="flex flex-col gap-3 rounded-2xl border border-amber-600 bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">{productsWord(count)}</h2>
        <p className="text-sm text-muted-foreground">
          {noticeText(filtering, brandHasFiscalDefaults)}
        </p>
      </div>
      <Button
        variant="outline"
        className="min-h-11 shrink-0"
        onClick={() => onFilterChange(!filtering)}
      >
        {filtering ? "Ver todos os produtos" : "Completar"}
      </Button>
    </section>
  );
}
