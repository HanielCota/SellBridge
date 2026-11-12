import type { SupplierOrdersUrlSearch } from "@sellbridge/shared/supplier-panel-orders-schema";

/**
 * How many of the folded filters narrow the list (period other than "Tudo", reseller, store,
 * channel, label, payment), so the phone's "Filtrar" button says when something is hiding orders.
 */
export function activeOrderFilterCount(
  search: Pick<
    SupplierOrdersUrlSearch,
    "period" | "reseller" | "store" | "channel" | "label" | "payment"
  >,
): number {
  const narrowing = [
    search.period !== "all",
    search.reseller !== undefined,
    search.store !== undefined,
    search.channel !== undefined,
    search.label !== undefined,
    search.payment !== undefined,
  ];
  return narrowing.filter(Boolean).length;
}

/** "Filtrar", or "Filtrar · 2 ativos" when some filter hides orders. */
export function filterButtonLabel(active: number): string {
  if (active === 0) {
    return "Filtrar";
  }
  return `Filtrar · ${active} ${active === 1 ? "ativo" : "ativos"}`;
}
