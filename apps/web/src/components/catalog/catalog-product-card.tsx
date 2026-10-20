import type { SellableCatalogProduct } from "@sellbridge/database/repositories";
import { formatCents } from "@sellbridge/shared/money";
import { Link } from "@tanstack/react-router";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { ACTION_ICONS, CONTROL_HINTS, TERM_HINTS } from "@/components/icons/action-icons";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { Checkbox } from "@/components/ui/checkbox";
import { estimateProfit, isThinMargin, wholeMarginPercent } from "@/features/listings/profit";
import { useFeeSchedule } from "@/features/reports/fee-schedule.queries";
import { ProductStockLine } from "./product-stock-line";
import { ProductVisual } from "./product-visual";
import { SoldOutFooter, SoldOutRibbon } from "./sold-out";

/** Suggested price as the headline; cost and the margin it leaves underneath. */
function PriceLines({ product, soldOut }: { product: SellableCatalogProduct; soldOut: boolean }) {
  const schedule = useFeeSchedule();
  const margin = estimateProfit(
    product.suggestedPriceCents,
    product.costCents,
    schedule,
  )?.marginPercent;
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
              margem {wholeMarginPercent(margin)}%
            </span>
          </>
        )}
      </p>
    </div>
  );
}

function CardBody({ product }: { product: SellableCatalogProduct }) {
  const soldOut = product.stock <= 0;
  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <div className="space-y-1">
        <p className="truncate text-xs text-muted-foreground">
          {product.catalogKind === "seller" ? "Your product" : product.supplierName}
        </p>
        <h2 className={cn("line-clamp-2 text-sm font-medium", soldOut && "text-muted-foreground")}>
          {product.title}
        </h2>
      </div>
      <PriceLines product={product} soldOut={soldOut} />
      {soldOut ? null : <StockFooter product={product} />}
    </div>
  );
}

const PublishIcon = ACTION_ICONS.publish.icon;

function StockFooter({ product }: { product: SellableCatalogProduct }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
      {/* As tall as the publish button, so published cards keep the price row level. */}
      <span className="flex min-h-8 items-center">
        <ProductStockLine stock={product.stock} updatedAt={product.stockUpdatedAt} />
      </span>
      {product.published ? null : (
        <Hint label={ACTION_ICONS.publish.hint} openOnTap={false}>
          <Button asChild variant="secondary" size="sm">
            <Link to="/publicacoes/nova" search={{ productId: product.id }}>
              <PublishIcon weight="bold" aria-hidden="true" />
              Publicar
            </Link>
          </Button>
        </Hint>
      )}
    </div>
  );
}

/** Marks a product already on sale; its legend says so for whoever does not read the badge. */
function PublishedBadge() {
  return (
    <Hint label={TERM_HINTS.published}>
      <span
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the badge's legend must be reachable by keyboard too
        tabIndex={0}
        className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-background px-2 py-1 text-xs font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <CheckCircleIcon className="size-3.5 text-brand-text" weight="fill" aria-hidden="true" />
        Publicado
      </span>
    </Hint>
  );
}

/** One product of the region catalog; selectable for bulk publishing. */
export function CatalogProductCard({
  product,
  selected,
  onSelectedChange,
}: {
  product: SellableCatalogProduct;
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
        <Hint label={CONTROL_HINTS.selectForBulk} openOnTap={false}>
          <Checkbox
            aria-label={`Selecionar ${product.title}`}
            checked={selected}
            onCheckedChange={(checked) => onSelectedChange(checked === true)}
            className="absolute top-3 left-3 size-5 bg-background"
          />
        </Hint>
      ) : null}
      {product.published ? <PublishedBadge /> : null}
      <CardBody product={product} />
      {soldOut ? <SoldOutFooter /> : null}
    </article>
  );
}
