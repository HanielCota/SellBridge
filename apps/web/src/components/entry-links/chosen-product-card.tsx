import { PackageIcon } from "@phosphor-icons/react";
import type { SellableCatalogProduct } from "@sellbridge/database/repositories";
import { formatCents } from "@sellbridge/shared/money";
import { Checkbox } from "@/components/ui/checkbox";
import { bulkPriceCents } from "@/features/catalog/bulk-price";
import { estimateProfit, type SaleChannels } from "@/features/listings/profit";
import { useFeeSchedule } from "@/features/reports/fee-schedule.queries";
import { cn } from "@/lib/utils";
import { useId } from "react";

const SUGGESTED_RULE = { kind: "suggested" } as const;

/** The supplier's suggested price and what it leaves, said before anything is prepared. */
function SuggestedPriceLine({
  product,
  channels,
}: {
  product: SellableCatalogProduct;
  channels: SaleChannels;
}) {
  const schedule = useFeeSchedule();
  const priceCents = bulkPriceCents(product, SUGGESTED_RULE, schedule, channels);
  const estimate = estimateProfit(priceCents, product, schedule, channels);
  if (priceCents === null || estimate === null) {
    return <p className="text-sm text-muted-foreground">Sem preço sugerido pelo fornecedor</p>;
  }
  if (estimate.profitCents < 0) {
    return (
      <p className="text-sm font-medium text-destructive">
        Pelo preço sugerido ({formatCents(priceCents)}) você perde{" "}
        {formatCents(-estimate.profitCents)} por venda
      </p>
    );
  }
  return (
    <p className="text-sm text-muted-foreground">
      Vende por {formatCents(priceCents)} · sobra {formatCents(estimate.profitCents)} por venda
    </p>
  );
}

function ProductPhoto({ imageUrl }: { imageUrl: string | null }) {
  if (imageUrl === null) {
    return (
      <div
        aria-hidden="true"
        className="grid size-16 shrink-0 place-items-center rounded-xl bg-muted"
      >
        <PackageIcon className="size-6 text-muted-foreground" />
      </div>
    );
  }
  return (
    <img
      src={imageUrl}
      alt=""
      width={64}
      height={64}
      className="size-16 shrink-0 rounded-xl object-cover"
    />
  );
}

/** One chosen product, ticked to go into the listings being prepared. */
export function ChosenProductCard({
  product,
  channels,
  ticked,
  tickDisabled,
  onTickedChange,
}: {
  product: SellableCatalogProduct;
  channels: SaleChannels;
  ticked: boolean;
  /** Set when the batch is already full: only ticked products can change. */
  tickDisabled: boolean;
  onTickedChange: (ticked: boolean) => void;
}) {
  const checkboxId = useId();
  return (
    <li
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-2xl border bg-card p-3 transition-colors",
        ticked ? "border-primary/60" : "opacity-80",
      )}
    >
      <Checkbox
        id={checkboxId}
        checked={ticked}
        disabled={tickDisabled}
        onCheckedChange={(checked) => onTickedChange(checked === true)}
        aria-label={`Preparar anúncio de ${product.title}`}
      />
      <label
        htmlFor={checkboxId}
        className={cn(
          "flex min-w-0 flex-1 cursor-pointer items-center gap-3",
          tickDisabled && "cursor-not-allowed",
        )}
      >
        <ProductPhoto imageUrl={product.imageUrl} />
        <div className="min-w-0 space-y-0.5">
          <p className="line-clamp-2 font-medium">{product.title}</p>
          <p className="text-sm text-muted-foreground">
            Você paga {formatCents(product.costCents)}
          </p>
          <SuggestedPriceLine product={product} channels={channels} />
        </div>
      </label>
    </li>
  );
}
