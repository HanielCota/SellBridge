function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** A resume keeps paused what would lose money: said apart, with what to do. */
export function heldBelowPriceFloor(held: number): string {
  const listings = plural(held, "anúncio continua pausado", "anúncios continuam pausados");
  return `${listings}: o preço não cobre o custo e as taxas. Ajuste o preço para reativar.`;
}

function backOnSale(count: number): string {
  return count === 1 ? "1 anúncio voltou a vender." : `${count} anúncios voltaram a vender.`;
}

/** The toast after the reconnection's question: what went back on sale and what stayed paused. */
export function resumeOutcomeMessage(outcome: { changed: number; held: number }): string {
  const resumed = outcome.changed > 0 ? backOnSale(outcome.changed) : "Nenhum anúncio reativado.";
  return outcome.held > 0 ? `${resumed} ${heldBelowPriceFloor(outcome.held)}` : resumed;
}
