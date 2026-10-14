/** The buyer as the marketplace named them; some sales arrive without a name. */
export function displayBuyerName(name: string | null): string {
  return name ?? "Comprador não informado";
}
