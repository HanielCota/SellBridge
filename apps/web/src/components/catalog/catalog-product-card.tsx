import type { RegionCatalogProduct } from "@sellbridge/database/repositories";
import { formatCents } from "@sellbridge/shared/money";
import { Link } from "@tanstack/react-router";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { estimateProfit, isThinMargin } from "@/features/listings/profit";
import { ProductStockLine } from "./product-stock-line";
import { ProductVisual } from "./product-visual";

/** Suggested price as the headline; cost and the margin it leaves underneath. */
function PriceLines({ product }: { product: RegionCatalogProduct }) {
  const margin = estimateProfit(product.suggestedPriceCents, product.costCents)?.marginPercent;
  return (
    <div className="mt-auto space-y-0.5 tabular-nums">
      <p className="text-lg leading-tight font-semibold tracking-tight">
        {formatCents(product.suggestedPriceCents)}
        <span className="sr-only"> preço sugerido</span>
      </p>
      <p className="text-xs text-muted-foreground">
        custo {formatCents(product.costCents)}
        {margin === undefined ? null : (
          <>
            {" · "}
            <span className={cn(isThinMargin(margin) && "text-amber-700 dark:text-amber-500")}>
              margem {Math.round(margin)}%
            </span>
          </>
        )}
      </p>
    </div>
  );
}

function CardBody({ product }: { product: RegionCatalogProduct }) {
  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <div className="space-y-1">
        <p className="truncate text-xs text-muted-foreground">{product.supplierName}</p>
        <h2 className="line-clamp-2 text-sm font-medium">{product.title}</h2>
      </div>
      <PriceLines product={product} />
      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <ProductStockLine stock={product.stock} />
        {product.stock > 0 && !product.published ? (
          <Link
            to="/publicacoes/nova"
            search={{ productId: product.id }}
            className="text-xs font-medium text-brand-text hover:underline"
          >
            Publicar
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/** One product of the region catalog; selectable for bulk publishing. */
export function CatalogProductCard({
  product,
  selected,
  onSelectedChange,
}: {
  product: RegionCatalogProduct;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
}) {
  const canSelect = product.stock > 0 && !product.published;
  return (
    <article
      className={cn(
        "surface-card flex h-full flex-col overflow-hidden rounded-3xl bg-card",
        selected && "ring-2 ring-brand",
      )}
    >
      <ProductVisual
        imageUrl={product.imageUrl}
        title={product.title}
        categoryName={product.categoryName}
        className="aspect-[16/10]"
      />
      {canSelect ? (
        <Checkbox
          aria-label={`Selecionar ${product.title}`}
          checked={selected}
          onCheckedChange={(checked) => onSelectedChange(checked === true)}
          className="absolute top-3 left-3 size-5 bg-background"
        />
      ) : null}
      {product.published ? (
        <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-background px-2 py-1 text-xs font-medium">
          <CheckCircleIcon className="size-3.5 text-brand-text" weight="fill" aria-hidden="true" />
          Publicado
        </span>
      ) : null}
      <CardBody product={product} />
    </article>
  );
}
