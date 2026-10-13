import type { RegionCatalogProduct } from "@sellbridge/database/repositories";
import { formatCents } from "@sellbridge/shared/money";
import { Link } from "@tanstack/react-router";
import { CheckCircleIcon, PackageIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { estimateProfit, isThinMargin } from "@/features/listings/profit";
import { ProductStockLine } from "./product-stock-line";
import { ProductVisual } from "./product-visual";
import { SoldOutFooter, SoldOutRibbon } from "./sold-out";

/** Suggested price as the headline; cost and the margin it leaves underneath. */
function PriceLines({ product, soldOut }: { product: RegionCatalogProduct; soldOut: boolean }) {
  const margin = estimateProfit(product.suggestedPriceCents, product.costCents)?.marginPercent;
  return (
    <div className="mt-auto space-y-0.5 tabular-nums">
      <p
        className={cn(
          "text-lg leading-tight font-semibold tracking-tight",
          soldOut && "text-muted-foreground line-through decoration-destructive",
        )}
      >
        {formatCents(product.suggestedPriceCents)}
        <span className="sr-only"> preço sugerido</span>
      </p>
      <p className="text-sm text-muted-foreground">
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
  const soldOut = product.stock <= 0;
  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <div className="space-y-1">
        <p className="truncate text-xs text-muted-foreground">{product.supplierName}</p>
        <h2 className={cn("line-clamp-2 text-sm font-medium", soldOut && "text-muted-foreground")}>
          {product.title}
        </h2>
      </div>
      <PriceLines product={product} soldOut={soldOut} />
      {soldOut ? null : <StockFooter product={product} />}
    </div>
  );
}

function StockFooter({ product }: { product: RegionCatalogProduct }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
      {/* As tall as the publish button, so published cards keep the price row level. */}
      <span className="flex min-h-8 items-center">
        <ProductStockLine stock={product.stock} updatedAt={product.stockUpdatedAt} />
      </span>
      {product.published ? null : (
        <Button asChild variant="secondary" size="sm">
          <Link to="/publicacoes/nova" search={{ productId: product.id }}>
            <PackageIcon weight="bold" aria-hidden="true" />
            Publicar
          </Link>
        </Button>
      )}
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
  const soldOut = product.stock <= 0;
  const canSelect = !soldOut && !product.published;

  /** The whole card toggles selection; its own controls (checkbox, "Publicar") keep their behavior. */
  function handleCardClick(event: React.MouseEvent<HTMLElement>) {
    if (!canSelect) return;
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("a, button, input, label")) return;
    onSelectedChange(!selected);
  }

  return (
    // Pointer shortcut only; the checkbox stays the keyboard and screen-reader control.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <article
      onClick={handleCardClick}
      className={cn(
        "surface-card flex h-full flex-col overflow-hidden rounded-3xl bg-card",
        canSelect && "cursor-pointer select-none",
        selected && "ring-2 ring-brand",
      )}
    >
      <ProductVisual
        imageUrl={product.imageUrl}
        title={product.title}
        categoryName={product.categoryName}
        soldOut={soldOut}
        className="aspect-[16/10]"
      />
      {soldOut ? <SoldOutRibbon /> : null}
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
      {soldOut ? <SoldOutFooter /> : null}
    </article>
  );
}
