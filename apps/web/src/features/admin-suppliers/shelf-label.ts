/** The admin's view of a product's stock: the shelf count, plus what paid orders are holding. */
export function shelfLabel(stock: number, reservedStock: number): string {
  if (reservedStock <= 0) {
    return String(stock);
  }
  const held = reservedStock === 1 ? "1 reservado" : `${reservedStock} reservados`;
  if (reservedStock <= stock) {
    return `${stock} · ${held}`;
  }
  // The shelf was lowered under the holds: say how many units paid orders are still owed.
  return `${stock} · ${held} · faltam ${reservedStock - stock}`;
}
