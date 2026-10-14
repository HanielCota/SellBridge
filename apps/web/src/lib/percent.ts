const wholePercent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });

/** A 0–1 ratio as a whole percentage: 0.374 → "37%". */
export function formatPercent(ratio: number): string {
  return wholePercent.format(ratio);
}
