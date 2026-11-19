import { CheckCircleIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const CHOICES = [
  {
    hasGrid: false,
    label: "Não, é um produto só",
    hint: "Um código, um estoque e um preço.",
  },
  {
    hasGrid: true,
    label: "Sim, tem cores ou tamanhos",
    hint: "O mesmo produto em várias cores ou tamanhos, cada um com o próprio estoque. Exemplo: um tênis em preto e branco, do 34 ao 44.",
  },
] as const;

/**
 * Asked first, before anything is typed or saved: a product sold in colours or sizes opens the
 * grid form instead. Once saved, a product keeps its kind.
 */
export function GridTypeQuestion({
  hasGrid,
  onChange,
}: {
  hasGrid: boolean;
  onChange: (hasGrid: boolean) => void;
}) {
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-subhead font-semibold">
        Este produto tem cores ou tamanhos?
      </legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {CHOICES.map((choice) => {
          const checked = choice.hasGrid === hasGrid;
          return (
            <label
              key={choice.label}
              className={cn(
                "flex min-h-16 cursor-pointer items-start justify-between gap-3 rounded-2xl border px-4 py-3 transition-colors select-none active:scale-[0.99] has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-ring/30",
                checked
                  ? "border-primary bg-primary/5"
                  : "border-field-border bg-card hover:bg-muted",
              )}
            >
              <input
                type="radio"
                name="panel-product-has-grid"
                value={choice.hasGrid ? "sim" : "nao"}
                checked={checked}
                onChange={() => onChange(choice.hasGrid)}
                className="sr-only"
              />
              <span className="space-y-0.5">
                <span className="block font-medium">{choice.label}</span>
                <span className="block text-footnote text-muted-foreground">{choice.hint}</span>
              </span>
              {checked ? (
                <CheckCircleIcon
                  weight="fill"
                  className="size-5 shrink-0 text-primary"
                  aria-hidden="true"
                />
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
