import { combinationLabel, MAX_GRID_COMBINATIONS } from "@sellbridge/shared/product-grid";
import { TextField } from "@/components/form/form-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { combinationField } from "@/features/supplier-panel/catalog/grid/grid-form-draft";
import type {
  CombinationValues,
  GridFormCombination,
  GridFormState,
} from "@/features/supplier-panel/catalog/grid/grid-form-state";
import { cn } from "@/lib/utils";

type Pair = { colorKey: string | null; sizeKey: string | null };

const COMBINATION_FIELDS = [
  { key: "sku", label: "Código", inputMode: "text" },
  { key: "stock", label: "Estoque (un.)", inputMode: "numeric" },
  { key: "cost", label: "Custo (R$)", inputMode: "decimal" },
  { key: "suggestedPrice", label: "Preço sugerido (R$)", inputMode: "decimal" },
  { key: "gtin", label: "Código de barras (opcional)", inputMode: "numeric" },
] as const;

/** Codes are typed as they are: no capital first letter, autocorrect or spell check. */
const CODE_INPUT = {
  autoCapitalize: "off",
  autoCorrect: "off",
  autoComplete: "off",
  spellCheck: false,
} as const;

function domId(pair: Pair, field: string): string {
  return `grid-${pair.colorKey ?? "x"}-${pair.sizeKey ?? "x"}-${field}`.replaceAll(/[^\w-]/g, "-");
}

function CombinationRow({
  label,
  pair,
  combination,
  errors,
  onToggle,
  onChange,
}: {
  label: string;
  pair: Pair;
  combination: GridFormCombination | undefined;
  errors: Readonly<Record<string, string>>;
  onToggle: (sold: boolean) => void;
  onChange: (change: Partial<CombinationValues>) => void;
}) {
  const checkboxId = domId(pair, "sold");
  return (
    <li
      className={cn(
        "grid gap-3 rounded-2xl border p-3",
        combination === undefined
          ? "border-dashed border-field-border"
          : "border-field-border bg-card",
      )}
    >
      <div className="flex min-h-11 items-center gap-3">
        <Checkbox
          id={checkboxId}
          checked={combination !== undefined}
          onCheckedChange={(next) => onToggle(next === true)}
        />
        <Label htmlFor={checkboxId} className="font-medium">
          {label}
        </Label>
        {combination === undefined ? (
          <span className="text-footnote text-muted-foreground">Não vendo esta</span>
        ) : null}
      </div>
      {combination === undefined ? null : (
        // The SKU gets the widest column: "TEN-CASUAL-PRETO-38" must read whole.
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
          {COMBINATION_FIELDS.map((field) => {
            const error = errors[combinationField(pair, field.key)];
            return (
              <TextField
                key={field.key}
                id={domId(pair, field.key)}
                label={field.label}
                value={combination[field.key]}
                errors={error === undefined ? [] : [error]}
                inputMode={field.inputMode}
                onValueChange={(value) => onChange({ [field.key]: value })}
                {...(field.key === "sku" || field.key === "gtin" ? CODE_INPUT : {})}
              />
            );
          })}
        </div>
      )}
    </li>
  );
}

/** Colour by colour, each in size order; a grid of sizes only is one group. */
function groupsOf(grid: GridFormState) {
  const colors = grid.colors.length === 0 ? [null] : grid.colors;
  const sizes = grid.sizes.length === 0 ? [null] : grid.sizes;
  return colors.map((color) => ({
    key: color?.key ?? "sizes",
    title: color === null ? "Tamanhos" : color.name,
    pairs: sizes.map((size) => ({
      pair: { colorKey: color?.key ?? null, sizeKey: size?.key ?? null },
      label: combinationLabel(color?.name ?? null, size?.name ?? null),
    })),
  }));
}

/**
 * Every pair of colour and size, sold or not: a sold one asks its SKU, stock, cost, price and
 * barcode; "Não vendo esta" leaves a pair out without removing its colour or size.
 */
export function GridCombinations({
  grid,
  errors,
  onToggle,
  onChange,
}: {
  grid: GridFormState;
  errors: Readonly<Record<string, string>>;
  onToggle: (pair: Pair, sold: boolean) => void;
  onChange: (pair: Pair, change: Partial<CombinationValues>) => void;
}) {
  if (grid.colors.length === 0 && grid.sizes.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-field-border px-6 py-8 text-center text-sm text-muted-foreground">
        Adicione as cores ou os tamanhos acima: cada combinação aparece aqui para você informar o
        SKU e o estoque.
      </p>
    );
  }
  const sold = grid.combinations.length;
  return (
    <section aria-labelledby="grid-combinations-title" className="grid gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="grid-combinations-title" className="text-subhead font-semibold">
          Combinações
        </h3>
        <p
          className={cn(
            "text-footnote tabular-nums",
            sold > MAX_GRID_COMBINATIONS ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {`${sold} de até ${MAX_GRID_COMBINATIONS}`}
        </p>
      </div>
      {groupsOf(grid).map((group) => (
        <div key={group.key} className="grid gap-2">
          <h4 className="text-sm font-semibold">{group.title}</h4>
          <ul className="grid gap-2">
            {group.pairs.map(({ pair, label }) => (
              <CombinationRow
                key={`${pair.colorKey ?? ""}-${pair.sizeKey ?? ""}`}
                label={label}
                pair={pair}
                combination={grid.combinations.find(
                  (entry) => entry.colorKey === pair.colorKey && entry.sizeKey === pair.sizeKey,
                )}
                errors={errors}
                onToggle={(next) => onToggle(pair, next)}
                onChange={(change) => onChange(pair, change)}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
