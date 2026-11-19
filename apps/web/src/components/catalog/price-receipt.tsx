import type { SellableCatalogProduct } from "@sellbridge/database/repositories";
import { formatCents } from "@sellbridge/shared/money";
import type { PriceRule } from "@sellbridge/shared/schemas";
import { useState } from "react";
import { ACTION_ICONS } from "@/components/icons/action-icons";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import {
  FeeLines,
  PROFIT_SPLIT_COLORS,
  ProfitSplitBar,
  ProfitSplitLine,
  profitTone,
  totalFeeCents,
} from "@/components/listings/profit-split";
import { bulkPriceCents, unreachableMarginMessage } from "@/features/catalog/bulk-price";
import {
  estimateProfit,
  type ProfitEstimate,
  type SaleChannels,
  wholeMarginPercent,
} from "@/features/listings/profit";
import { useFeeSchedule } from "@/features/reports/fee-schedule.queries";
import { cn } from "@/lib/utils";

const PreviousIcon = ACTION_ICONS.previous.icon;
const NextIcon = ACTION_ICONS.next.icon;
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
          <Hint label={ACTION_ICONS.previous.hint} openOnTap={false}>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label="Produto anterior"
              onClick={() => onIndexChange((index - 1 + total) % total)}
            >
              <PreviousIcon aria-hidden="true" />
            </Button>
          </Hint>
          {index + 1} de {total}
          <Hint label={ACTION_ICONS.next.hint} openOnTap={false}>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label="Próximo produto"
              onClick={() => onIndexChange((index + 1) % total)}
            >
              <NextIcon aria-hidden="true" />
            </Button>
          </Hint>
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
  channels,
  ruleFor,
  adjust,
}: {
  products: SellableCatalogProduct[];
  channels: SaleChannels;
  ruleFor: (product: SellableCatalogProduct) => PriceRule;
  adjust?: ((product: SellableCatalogProduct) => React.ReactNode) | undefined;
}) {
  const [index, setIndex] = useState(0);
  const schedule = useFeeSchedule();
  const product = products[index % products.length];
  if (!product) {
    return null;
  }
  const rule = ruleFor(product);
  const price = bulkPriceCents(product, rule, schedule, channels);
  const estimate = price === null ? null : estimateProfit(price, product, schedule, channels);
  const header = (
    <>
      <ProductStepper
        title={product.title}
        index={index % products.length}
        total={products.length}
        onIndexChange={setIndex}
      />
      {adjust ? adjust(product) : null}
    </>
  );
  if (price === null || estimate === null) {
    return (
      <div className="space-y-3 px-3.5 py-3">
        {header}
        {rule.kind === "margin" ? (
          <p className="text-sm text-destructive">
            {unreachableMarginMessage(product.title, rule.percent)}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <div className="space-y-3 px-3.5 py-3">
      {header}
      <ReceiptLines product={product} estimate={estimate} priceCents={price} />
    </div>
  );
}

function ReceiptLines({
  product,
  estimate,
  priceCents,
}: {
  product: SellableCatalogProduct;
  estimate: ProfitEstimate;
  priceCents: number;
}) {
  const schedule = useFeeSchedule();
  const { profitCents, marginPercent } = estimate;
  const isLoss = profitCents < 0;
  return (
    <>
      <ProfitSplitBar
        costCents={product.costCents}
        feeCents={totalFeeCents(estimate)}
        profitCents={profitCents}
      />

      <dl className="space-y-1.5 text-sm">
        <ProfitSplitLine
          swatch={PROFIT_SPLIT_COLORS.cost}
          label="Custo do fornecedor"
          value={formatCents(product.costCents)}
        />
        <FeeLines estimate={estimate} schedule={schedule} />
        <ProfitSplitLine
          swatch={isLoss ? PROFIT_SPLIT_COLORS.loss : PROFIT_SPLIT_COLORS.profit}
          label={isLoss ? "Seu prejuízo" : "Seu lucro"}
          value={`${formatCents(Math.abs(profitCents))} (${wholeMarginPercent(marginPercent)}%)`}
          valueClassName={cn("font-medium", profitTone(profitCents, marginPercent))}
        />
        <div className="flex items-center justify-between border-t border-border pt-2 font-medium">
          <dt>Preço de venda</dt>
          <dd className="tabular-nums">{formatCents(priceCents)}</dd>
        </div>
      </dl>
    </>
  );
}
