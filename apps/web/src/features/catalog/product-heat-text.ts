import {
  PRODUCT_HEAT_WINDOW_IN_DAYS,
  type ProductHeatLevel,
} from "@sellbridge/shared/product-heat";

const unitsFormatter = new Intl.NumberFormat("pt-BR");

export const PRODUCT_HEAT_LABELS: Record<ProductHeatLevel, string> = {
  none: "Sem vendas ainda",
  cold: "Frio",
  warm: "Morno",
  hot: "Quente",
};

export const PRODUCT_HEAT_HINT = `Vendas deste produto nos últimos ${PRODUCT_HEAT_WINDOW_IN_DAYS} dias, somando todas as lojas do SellBridge. Ninguém vê quais lojas venderam.`;

/** "32 vendas em 30 dias"; null with no sale, where the tag already says it. */
export function recentSalesText(unitsSold: number): string | null {
  if (unitsSold === 0) {
    return null;
  }
  const noun = unitsSold === 1 ? "venda" : "vendas";
  return `${unitsFormatter.format(unitsSold)} ${noun} em ${PRODUCT_HEAT_WINDOW_IN_DAYS} dias`;
}
