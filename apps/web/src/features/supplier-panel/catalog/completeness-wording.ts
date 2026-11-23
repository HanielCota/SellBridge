export type CompletenessTier = "blocked" | "pending_on_sale" | "improvable" | "complete";

/**
 * Which completeness message a product gets. Missing required data blocks a new product, but a
 * product already approved and on sale keeps selling: it only has data to complete (the NCM for
 * the note, say), so it never reads "impede publicar" beside "Aprovado".
 */
export function completenessTier(input: {
  score: number;
  blocking: number;
  onSale: boolean;
}): CompletenessTier {
  if (input.blocking > 0) {
    return input.onSale ? "pending_on_sale" : "blocked";
  }
  return input.score === 100 ? "complete" : "improvable";
}

export function completenessLabel(tier: CompletenessTier, blocking: number): string {
  if (tier === "blocked") {
    return `${blocking} ${blocking === 1 ? "impede" : "impedem"} publicar`;
  }
  if (tier === "pending_on_sale") {
    return `À venda · ${blocking} ${blocking === 1 ? "dado a completar" : "dados a completar"}`;
  }
  return tier === "complete" ? "Anúncio completo" : "Pode melhorar";
}
