import { formatCents } from "@sellbridge/shared/money";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { SearchInput } from "@/components/data/search-input";
import { TextField } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { DraftErrors, DraftItem } from "@/features/manual-sales/manual-sale-draft";
import { searchManualSaleProductsFn } from "@/features/manual-sales/manual-sale.functions";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { maskCurrencyInput } from "@/lib/currency-mask";

const SEARCH_DELAY_MILLISECONDS = 250;
export const PRODUCT_SEARCH_ID = "manual-sale-product-search";

export type FoundProduct = Awaited<ReturnType<typeof searchManualSaleProductsFn>>[number];

function stockLabel(stock: number): string {
  if (stock <= 0) {
    return "Sem estoque";
  }
  return stock === 1 ? "1 em estoque" : `${stock} em estoque`;
}

function addLabel(isChosen: boolean): string {
  return isChosen ? "Adicionado" : "Adicionar";
}

/** Finds the products to add: by name or code, from every supplier the reseller can sell. */
export function ProductSearch({
  error,
  chosenIds,
  onAdd,
}: {
  error: string | undefined;
  chosenIds: ReadonlySet<string>;
  onAdd: (product: FoundProduct) => void;
}) {
  const [search, setSearch] = useState("");
  const query = useDebouncedValue(search.trim(), SEARCH_DELAY_MILLISECONDS);
  const results = useQuery({
    queryKey: ["manual-sale-products", query],
    queryFn: () => searchManualSaleProductsFn({ data: { query } }),
  });
  return (
    <div className="space-y-2">
      <div id={PRODUCT_SEARCH_ID} tabIndex={-1} className="outline-none">
        <SearchInput
          label="Buscar produto"
          placeholder="Nome ou código do produto"
          maxLength={100}
          value={search}
          onValueChange={setSearch}
        />
      </div>
      {error === undefined ? null : (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <ProductResults
        products={results.data}
        loading={results.isPending}
        chosenIds={chosenIds}
        onAdd={onAdd}
      />
    </div>
  );
}

function ProductResults({
  products,
  loading,
  chosenIds,
  onAdd,
}: {
  products: FoundProduct[] | undefined;
  loading: boolean;
  chosenIds: ReadonlySet<string>;
  onAdd: (product: FoundProduct) => void;
}) {
  if (loading || products === undefined) {
    return <Skeleton className="h-28 w-full rounded-xl" />;
  }
  if (products.length === 0) {
    return (
      <p className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
        Nenhum produto encontrado. Tente outro nome ou o código do produto.
      </p>
    );
  }
  return (
    <ul
      aria-label="Produtos encontrados"
      className="divide-y rounded-xl border border-field-border"
    >
      {products.map((product) => (
        <li key={product.id} className="flex items-center gap-3 px-3 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 block text-sm font-medium break-words">
              {product.title}
            </span>
            <span className="block text-footnote break-words text-muted-foreground">
              {product.supplierName} · código {product.sku} · {stockLabel(product.stock)} · sugerido{" "}
              {formatCents(product.suggestedPriceCents)}
            </span>
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={chosenIds.has(product.id)}
            onClick={() => onAdd(product)}
            aria-label={`${addLabel(chosenIds.has(product.id))} ${product.title}, código ${product.sku}`}
          >
            <PlusIcon aria-hidden="true" />
            {addLabel(chosenIds.has(product.id))}
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** One chosen product: how many were sold and for how much, each unit. */
export function SaleItemRow({
  item,
  index,
  errors,
  onChange,
  onRemove,
}: {
  item: DraftItem;
  index: number;
  errors: DraftErrors;
  onChange: (patch: Partial<Pick<DraftItem, "quantity" | "price">>) => void;
  onRemove: () => void;
}) {
  const quantityError = errors[`items.${index}.quantity`];
  const priceError = errors[`items.${index}.unitPriceCents`];
  return (
    <li className="space-y-3 rounded-xl border border-field-border p-3">
      <div className="flex items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium break-words">{item.title}</span>
          <span className="block text-footnote text-muted-foreground">
            {item.supplierName} · {stockLabel(item.stock)}
          </span>
        </span>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={onRemove}
          aria-label={`Tirar ${item.title} da venda`}
        >
          <TrashIcon aria-hidden="true" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField
          id={`manual-sale-items-${index}-quantity`}
          label="Quantidade"
          inputMode="numeric"
          value={item.quantity}
          errors={quantityError === undefined ? [] : [quantityError]}
          onValueChange={(quantity) => onChange({ quantity: quantity.replace(/\D/g, "") })}
        />
        <TextField
          id={`manual-sale-items-${index}-unitPriceCents`}
          label="Preço de venda (R$)"
          inputMode="numeric"
          value={item.price}
          errors={priceError === undefined ? [] : [priceError]}
          onValueChange={(price) => onChange({ price: maskCurrencyInput(price) })}
        />
      </div>
    </li>
  );
}
