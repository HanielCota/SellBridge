import {
  formatResellerDiscount,
  parseResellerDiscount,
} from "@sellbridge/shared/erp-reseller-price";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * "O revendedor paga [ 30 ]% a menos que o preço do Bling" + "Aplicar a todos": one rule fills
 * every new product's price; each one stays editable afterwards.
 */
export function BlingDiscountRule(props: {
  savedTenths: number | null;
  onApply: (tenths: number) => void;
}) {
  const [text, setText] = useState(
    props.savedTenths === null ? "" : formatResellerDiscount(props.savedTenths),
  );
  const [problem, setProblem] = useState<string | null>(null);

  function apply() {
    const parsed = parseResellerDiscount(text);
    if (!parsed.ok) {
      setProblem(parsed.message);
      return;
    }
    setProblem(null);
    props.onApply(parsed.tenths);
  }

  return (
    <div className="grid gap-2 rounded-2xl bg-muted/60 p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
        <label htmlFor="bling-desconto" className="text-sm font-medium">
          O revendedor paga
        </label>
        <span className="flex h-11 w-24 items-center gap-1 rounded-xl border border-field-border bg-card px-3 focus-within:ring-2 focus-within:ring-ring/40">
          <input
            id="bling-desconto"
            inputMode="decimal"
            autoComplete="off"
            placeholder="30"
            value={text}
            aria-invalid={problem !== null}
            aria-describedby="bling-desconto-ajuda"
            onChange={(event) => setText(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") apply();
            }}
            className="min-w-0 flex-1 bg-transparent text-right tabular-nums outline-none"
          />
          <span className="text-muted-foreground">%</span>
        </span>
        <span className="text-sm">a menos que o preço do Bling</span>
        <Button variant="outline" size="lg" onClick={apply}>
          Aplicar a todos
        </Button>
      </div>
      <p
        id="bling-desconto-ajuda"
        aria-live="polite"
        className={
          problem === null
            ? "text-sm text-muted-foreground"
            : "text-sm font-medium text-destructive"
        }
      >
        {problem ??
          "Preenche o preço de todos os produtos novos de uma vez. Depois você pode mudar qualquer um."}
      </p>
    </div>
  );
}
