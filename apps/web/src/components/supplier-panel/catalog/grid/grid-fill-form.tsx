import { useState, type FormEvent } from "react";
import { TextField } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import type { GridFill } from "@/features/supplier-panel/catalog/grid/grid-form-state";

const EMPTY_FILL: GridFill = { skuBase: "", cost: "", suggestedPrice: "", stock: "" };

const FILL_FIELDS = [
  { key: "skuBase", label: "Código base", inputMode: "text", placeholder: "Exemplo: TEN-CASUAL" },
  { key: "cost", label: "Custo (R$)", inputMode: "decimal", placeholder: "Exemplo: 59,90" },
  {
    key: "suggestedPrice",
    label: "Preço sugerido (R$)",
    inputMode: "decimal",
    placeholder: "Exemplo: 119,90",
  },
  { key: "stock", label: "Estoque (un.)", inputMode: "numeric", placeholder: "Exemplo: 10" },
] as const;

/**
 * Typed once for every combination, so a grid of 30 is not 30 forms: the code base becomes
 * "TEN-CASUAL-PRETO-38" only where no SKU was typed, and blank fields change nothing.
 */
export function GridFillForm({
  combinationCount,
  onFill,
}: {
  combinationCount: number;
  onFill: (fill: GridFill) => void;
}) {
  const [fill, setFill] = useState<GridFill>(EMPTY_FILL);
  const empty = Object.values(fill).every((value) => value.trim() === "");
  function submit(event: FormEvent) {
    event.preventDefault();
    onFill(fill);
    setFill(EMPTY_FILL);
  }
  return (
    <form
      onSubmit={submit}
      noValidate
      aria-labelledby="grid-fill-title"
      className="grid gap-4 rounded-2xl border border-field-border p-4"
    >
      <div className="space-y-1">
        <h3 id="grid-fill-title" className="text-subhead font-semibold">
          Preencher todas as combinações
        </h3>
        <p className="text-footnote text-muted-foreground">
          Preencha só o que é igual para todas. O código vira o SKU de cada uma (exemplo:
          TEN-CASUAL-PRETO-38) e não troca um SKU que você já digitou.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FILL_FIELDS.map((field) => (
          <TextField
            key={field.key}
            id={`grid-fill-${field.key}`}
            label={field.label}
            value={fill[field.key]}
            errors={[]}
            inputMode={field.inputMode}
            placeholder={field.placeholder}
            autoComplete="off"
            onValueChange={(value) => setFill((current) => ({ ...current, [field.key]: value }))}
          />
        ))}
      </div>
      <Button
        type="submit"
        variant="secondary"
        className="w-full sm:w-auto sm:justify-self-start"
        disabled={empty || combinationCount === 0}
      >
        {combinationCount === 1
          ? "Preencher a combinação"
          : `Preencher as ${combinationCount} combinações`}
      </Button>
    </form>
  );
}
