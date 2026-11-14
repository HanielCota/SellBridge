import { productHeatLevel, type ProductHeatLevel } from "@sellbridge/shared/product-heat";
import {
  FireIcon,
  SnowflakeIcon,
  ThermometerHotIcon,
  ThermometerSimpleIcon,
  type Icon,
} from "@phosphor-icons/react";
import { HintedText } from "@/components/ui/hint";
import {
  PRODUCT_HEAT_HINT,
  PRODUCT_HEAT_LABELS,
  recentSalesText,
} from "@/features/catalog/product-heat-text";
import { cn } from "@/lib/utils";

/** Tinted tag, dark text on the light tint: heat reads warm to cold, no sale stays neutral grey. */
const HEAT_STYLES: Record<ProductHeatLevel, { icon: Icon; classes: string }> = {
  hot: { icon: FireIcon, classes: "bg-orange-500/15 text-orange-800 dark:text-orange-300" },
  warm: {
    icon: ThermometerHotIcon,
    classes: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  },
  cold: {
    icon: SnowflakeIcon,
    classes: "bg-sky-600/12 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  },
  none: { icon: ThermometerSimpleIcon, classes: "bg-foreground/[0.06] text-muted-foreground" },
};

/**
 * How hot a product is, with the sales behind it ("Quente · 32 vendas em 30 dias"). Its legend
 * says where the number comes from. `detailed` adds "no SellBridge" where there is room.
 */
export function ProductHeatTag({
  unitsSold,
  detailed = false,
  className,
}: {
  unitsSold: number;
  detailed?: boolean;
  className?: string;
}) {
  const level = productHeatLevel(unitsSold);
  const { icon: HeatIcon, classes } = HEAT_STYLES[level];
  const sales = recentSalesText(unitsSold);
  return (
    <HintedText
      label={PRODUCT_HEAT_HINT}
      className={cn("inline-flex w-fit flex-wrap items-center gap-x-2 gap-y-1", className)}
    >
      <span
        className={cn(
          "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-footnote font-medium whitespace-nowrap",
          classes,
        )}
      >
        <HeatIcon className="size-3.5 shrink-0" weight="fill" aria-hidden="true" />
        {PRODUCT_HEAT_LABELS[level]}
      </span>
      {sales === null ? null : (
        <span className="text-xs text-muted-foreground">
          {detailed ? `${sales} no SellBridge` : sales}
        </span>
      )}
    </HintedText>
  );
}
