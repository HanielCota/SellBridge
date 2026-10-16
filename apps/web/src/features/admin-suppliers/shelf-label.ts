/**
 * The admin's view of a product's stock: the shelf count, plus what paid orders are holding.
 * `held` is the secondary part, shown quieter than the count it qualifies.
 */
export function shelfParts(
  stock: number,
  reservedStock: number,
): { shelf: string; held: string | null } {
  const shelf = String(stock);
  if (reservedStock <= 0) {
    return { shelf, held: null };
  }
  const held = reservedStock === 1 ? "1 reservado" : `${reservedStock} reservados`;
  if (reservedStock <= stock) {
    return { shelf, held };
  }
  // The shelf was lowered under the holds: say how many units paid orders are still owed.
  return { shelf, held: `${held} · faltam ${reservedStock - stock}` };
}

export function shelfLabel(stock: number, reservedStock: number): string {
  const { shelf, held } = shelfParts(stock, reservedStock);
  return held === null ? shelf : `${shelf} · ${held}`;
}
