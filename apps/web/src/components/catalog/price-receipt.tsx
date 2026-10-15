import type { SellableCatalogProduct } from "@sellbridge/database/repositories";
import { formatCents } from "@sellbridge/shared/money";
import { priceForRule, type PriceRule } from "@sellbridge/shared/schemas";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  PROFIT_SPLIT_COLORS,
  ProfitSplitBar,
  ProfitSplitLine,
  profitTone,
} from "@/components/listings/profit-split";
import {
  ESTIMATED_MARKETPLACE_FEE_PERCENT_LABEL,
  estimateProfit,
} from "@/features/listings/profit";
import { cn } from "@/lib/utils";

function ProductStepper({
  title,
  index,
  total,
  onIndexChange,
}: {
  title: string;
  index: number;
  total: number;
  onIndexChange: (index: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {total > 1 ? (
        <span className="flex shrink-0 items-center tabular-nums">
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Produto anterior"
            onClick={() => onIndexChange((index - 1 + total) % total)}
          >
            <CaretLeftIcon aria-hidden="true" />
          </Button>
          {index + 1} de {total}
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Próximo produto"
            onClick={() => onIndexChange((index + 1) % total)}
          >
            <CaretRightIcon aria-hidden="true" />
          </Button>
        </span>
      ) : null}
    </div>
  );
}

/**
 * Where each real of the sale price goes for one product: supplier cost, the estimated
 * marketplace fee and what is left for the reseller. Steps through the selection; `adjust`
 * renders the controls that change the price of the product on screen.
 */
export function PriceReceipt({
  products,
  ruleFor,
  adjust,
}: {
  products: SellableCatalogProduct[];
  ruleFor: (product: SellableCatalogProduct) => PriceRule;
  adjust?: ((product: SellableCatalogProduct) => React.ReactNode) | undefined;
}) {
  const [index, setIndex] = useState(0);
  const product = products[index % products.length];
  if (!product) {
    return null;
  }
  const price = priceForRule(product, ruleFor(product));
  const estimate = estimateProfit(price, product.costCents);
  if (!estimate) {
    return null;
  }
  const { feeCents, profitCents, marginPercent } = estimate;
  const isLoss = profitCents < 0;
  return (
    <div className="space-y-3 px-3.5 py-3">
      <ProductStepper
        title={product.title}
        index={index % products.length}
        total={products.length}
        onIndexChange={setIndex}
      />
      {adjust ? adjust(product) : null}
      <ProfitSplitBar costCents={product.costCents} feeCents={feeCents} profitCents={profitCents} />

      <dl className="space-y-1.5 text-sm">
        <ProfitSplitLine
          swatch={PROFIT_SPLIT_COLORS.cost}
          label="Custo do fornecedor"
          value={formatCents(product.costCents)}
        />
        <ProfitSplitLine
          swatch={PROFIT_SPLIT_COLORS.fee}
          label={`Taxa do marketplace (~${ESTIMATED_MARKETPLACE_FEE_PERCENT_LABEL})`}
          value={formatCents(feeCents)}
        />
        <ProfitSplitLine
          swatch={isLoss ? PROFIT_SPLIT_COLORS.loss : PROFIT_SPLIT_COLORS.profit}
          label={isLoss ? "Seu prejuízo" : "Seu lucro"}
          value={`${formatCents(Math.abs(profitCents))} (${Math.round(marginPercent)}%)`}
          valueClassName={cn("font-medium", profitTone(profitCents, marginPercent))}
        />
        <div className="flex items-center justify-between border-t border-border pt-2 font-medium">
          <dt>Preço de venda</dt>
          <dd className="tabular-nums">{formatCents(price)}</dd>
        </div>
      </dl>
    </div>
  );
}
