import type { getNewListingData } from "@/features/listings/listings.functions";
import { ProductVisual } from "@/components/catalog/product-visual";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FeeLines,
  PROFIT_SPLIT_COLORS,
  ProfitSplitBar,
  ProfitSplitLine,
  profitTone,
} from "@/components/listings/profit-split";
import {
  estimateProfit,
  type ProductCost,
  type ProfitEstimate,
  type SaleChannels,
} from "@/features/listings/profit";
import { useFeeSchedule } from "@/features/reports/fee-schedule.queries";
import { formatCents } from "@sellbridge/shared/money";
import { cn } from "@/lib/utils";
import { ACTION_ICONS } from "@/components/icons/action-icons";
import { HintedText } from "@/components/ui/hint";
import type { RatesSource } from "@/features/listings/mercado-livre-rates-note";
import { RatesNotes } from "./rates-notes";

/** The new-listing page's side column cards, apart so the route file stays a page of its own. */
const SupplierShipsIcon = ACTION_ICONS.supplierShips.icon;

/** The product as the screen prices it: with the stores' own Mercado Livre numbers once read. */
type ListingProduct = Awaited<ReturnType<typeof getNewListingData>>["product"] &
  Pick<ProductCost, "mercadoLivreRates">;

/** Roughly how the ad reads on a marketplace grid: photo, title and price, live as they change. */
export function ListingPreview({
  product,
  title,
  priceCents,
}: {
  product: ListingProduct;
  title: string;
  priceCents: number | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-normal text-muted-foreground">
          Prévia do anúncio
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-3 overflow-hidden rounded-2xl bg-background p-2 ring-1 ring-border">
          <ProductVisual
            imageUrl={product.imageUrls.at(0) ?? null}
            title={title}
            categoryName={product.categoryName}
            className="aspect-square w-28! shrink-0 rounded-xl"
          />
          <div className="min-w-0 space-y-1 py-1 pr-1">
            <p className="line-clamp-2 text-sm wrap-anywhere">
              {title.trim() || "Título do anúncio"}
            </p>
            <p className="text-lg font-semibold tabular-nums">
              {priceCents === null ? "—" : formatCents(priceCents)}
            </p>
            <p className="text-xs text-brand-text">
              <HintedText
                label={
                  product.catalogKind === "seller"
                    ? "Você prepara e envia este produto do seu próprio estoque."
                    : ACTION_ICONS.supplierShips.hint
                }
                className="inline-flex items-start gap-1"
              >
                <SupplierShipsIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                {product.catalogKind === "seller" ? "Enviado por você" : "Enviado pelo fornecedor"}
              </HintedText>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Whole reais big, cents small, like the dashboard tiles. */
function ProfitFigure({ estimate }: { estimate: ProfitEstimate | null }) {
  if (!estimate) {
    return <p className="text-3xl font-semibold tracking-tight">—</p>;
  }
  const [reais, cents] = formatCents(Math.abs(estimate.profitCents))
    .replace(/^R\$\s?/, "")
    .split(",");
  return (
    <p
      className={cn(
        "flex items-baseline gap-1 tabular-nums transition-colors duration-300",
        estimate.profitCents < 0 ? "text-destructive" : "text-foreground",
      )}
    >
      <span className="text-sm text-muted-foreground">
        {estimate.profitCents < 0 ? "− R$" : "R$"}
      </span>
      <span>
        <span className="text-3xl font-semibold tracking-tight">{reais}</span>
        <span className="text-base font-medium text-muted-foreground">,{cents}</span>
      </span>
    </p>
  );
}

function costLabel(product: ListingProduct): string {
  return product.catalogKind === "seller"
    ? "Seu custo por unidade"
    : "Custo por unidade do fornecedor";
}

export function ProfitCard({
  priceCents,
  product,
  channels,
  ratesSource = null,
}: {
  priceCents: number | null;
  product: ListingProduct;
  /** The chosen stores' channels: the card shows the one that leaves the least. */
  channels: SaleChannels;
  /** Where the Mercado Livre numbers came from; null when they are the estimate. */
  ratesSource?: RatesSource | null;
}) {
  const schedule = useFeeSchedule();
  const estimate = estimateProfit(priceCents, product, schedule, channels);
  const isLoss = estimate !== null && estimate.profitCents < 0;
  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            {isLoss ? "Prejuízo estimado" : "Lucro estimado"} por venda
          </p>
          <ProfitFigure estimate={estimate} />
        </div>
        {estimate ? (
          <ProfitSplitBar
            costCents={product.costCents}
            feeCents={estimate.feeCents}
            profitCents={estimate.profitCents}
          />
        ) : null}
        <dl className="space-y-1.5 text-sm">
          <ProfitSplitLine
            swatch={PROFIT_SPLIT_COLORS.cost}
            label={costLabel(product)}
            value={formatCents(product.costCents)}
          />
          <FeeLines estimate={estimate} />
          <ProfitSplitLine
            swatch={isLoss ? PROFIT_SPLIT_COLORS.loss : PROFIT_SPLIT_COLORS.profit}
            label={isLoss ? "Seu prejuízo" : "Seu lucro"}
            value={estimate ? formatCents(Math.abs(estimate.profitCents)) : "—"}
            valueClassName={
              estimate
                ? cn("font-medium", profitTone(estimate.profitCents, estimate.marginPercent))
                : undefined
            }
          />
          <div className="flex items-center justify-between border-t border-border pt-2 font-medium">
            <dt>Preço de venda</dt>
            <dd className="tabular-nums">{priceCents === null ? "—" : formatCents(priceCents)}</dd>
          </div>
        </dl>
        <RatesNotes ratesSource={ratesSource} weightGrams={product.weightGrams} />
      </CardContent>
    </Card>
  );
}
