import type { OperationShare } from "@sellbridge/shared/supplier-panel-operation";

/**
 * The words of the home's "Sua operação" cards. Pure, so every sentence a supplier reads is
 * checked by a test.
 */

const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
const count = new Intl.NumberFormat("pt-BR");
// The month buckets come as their first day in Brazil time; read at UTC midnight, they stay put.
const monthName = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function plural(value: number, one: string, many: string): string {
  return `${count.format(value)} ${value === 1 ? one : many}`;
}

/** "7,5%", or a dash when there is nothing to count. */
export function formatShareRate(share: OperationShare): string {
  if (share.rate === null) {
    return "—";
  }
  return percent.format(share.rate);
}

/** "3 de 40 envios", or what is missing when nothing counted yet. */
export function formatShareDetail(
  share: OperationShare,
  noun: { one: string; many: string; none: string },
): string {
  if (share.rate === null) {
    return noun.none;
  }
  return `${count.format(share.part)} de ${plural(share.total, noun.one, noun.many)}`;
}

/** "Novembro de 2026" from a month bucket ("2026-11-01"); the raw text when it is not a date. */
export function formatMonth(bucket: string): string {
  const date = new Date(`${bucket}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return bucket;
  }
  const name = monthName.format(date);
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

/**
 * "12 unidades em estoque"; null when nothing is left (a negative stock is held by paid orders),
 * since the stock status beside it already says "Sem estoque".
 */
export function formatStockUnits(availableStock: number): string | null {
  if (Number.isFinite(availableStock) && availableStock > 0) {
    return `${plural(availableStock, "unidade", "unidades")} em estoque`;
  }
  return null;
}

/** "12 pedidos". */
export function formatOrders(orders: number): string {
  return plural(orders, "pedido", "pedidos");
}
