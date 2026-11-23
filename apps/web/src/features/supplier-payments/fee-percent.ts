const BASIS_POINTS_PER_PERCENT = 100;
const percentFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

/** "5%", "4,5%": a fee rate in basis points, as the screens write it. */
export function formatFeePercent(basisPoints: number): string {
  return `${percentFormat.format(basisPoints / BASIS_POINTS_PER_PERCENT)}%`;
}
