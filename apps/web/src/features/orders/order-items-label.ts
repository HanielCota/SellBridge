/**
 * What sold, beside the order number: the first item's title, and how many more there are.
 * Null for an order without items, which has nothing to name.
 */
export function orderItemsLabel(firstTitle: string | null, itemCount: number): string | null {
  if (firstTitle === null || firstTitle.trim() === "" || itemCount <= 0) {
    return null;
  }
  const others = itemCount - 1;
  if (others === 0) {
    return firstTitle;
  }
  return `${firstTitle} e mais ${others} ${others === 1 ? "item" : "itens"}`;
}
