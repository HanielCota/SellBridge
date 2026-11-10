import type { ErpImportRow } from "@sellbridge/shared/erp-catalog";
import { formatCents } from "@sellbridge/shared/money";
import { typedCents } from "@/features/supplier-panel/bling/bling-prices";
import { maskCurrencyInput, readPastedCurrency } from "@/lib/currency-mask";
import { cn } from "@/lib/utils";
import { BlingBadge } from "./bling-badge";

function ProductPhoto({ url }: { url: string | null }) {
  if (url === null) {
    return <span aria-hidden="true" className="size-14 flex-none rounded-xl bg-muted" />;
  }
  return (
    <img
      src={url}
      alt=""
      width={56}
      height={56}
      loading="lazy"
      className="size-14 flex-none rounded-xl bg-muted object-cover"
    />
  );
}

function erpPriceLine(row: ErpImportRow): string {
  if (row.erpPriceCents === null) {
    return `Código ${row.sku} · sem preço no Bling`;
  }
  return `Código ${row.sku} · no Bling ${formatCents(row.erpPriceCents)} (vira o preço sugerido)`;
}

/** One new product: what Bling says and the reseller price field the supplier can change. */
export function BlingPriceRow(props: {
  row: ErpImportRow;
  value: string;
  onChange: (value: string) => void;
}) {
  const { row } = props;
  const priced = typedCents(props.value) !== null;
  const fieldId = `preco-revendedor-${row.sku}`;
  return (
    <li className="grid grid-cols-[56px_minmax(0,1fr)] gap-3 border-t py-3.5">
      <ProductPhoto url={row.imageUrl} />
      <div className="grid min-w-0 gap-2">
        <div className="grid gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium break-words">{row.title}</span>
            {priced ? (
              <BlingBadge tone="success">Pronto</BlingBadge>
            ) : (
              <BlingBadge tone="warning">Falta o preço</BlingBadge>
            )}
          </div>
          <span className="text-sm break-words text-muted-foreground">{erpPriceLine(row)}</span>
        </div>
        <label htmlFor={fieldId} className="text-sm font-medium">
          Preço para o revendedor
        </label>
        <div
          className={cn(
            "flex h-11 max-w-64 items-center gap-1.5 rounded-xl border bg-card px-3 focus-within:ring-2 focus-within:ring-ring/40",
            priced ? "border-field-border" : "border-amber-700",
          )}
        >
          <span className="text-muted-foreground">R$</span>
          <input
            id={fieldId}
            inputMode="numeric"
            autoComplete="off"
            placeholder="Ex.: 24,90"
            value={props.value}
            aria-invalid={!priced}
            onPaste={(event) => {
              event.preventDefault();
              const pasted = readPastedCurrency(event.clipboardData.getData("text"));
              if (pasted !== null) props.onChange(pasted);
            }}
            onChange={(event) => props.onChange(maskCurrencyInput(event.currentTarget.value))}
            className="min-w-0 flex-1 bg-transparent tabular-nums outline-none"
          />
        </div>
      </div>
    </li>
  );
}
