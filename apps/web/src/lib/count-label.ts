const countFormat = new Intl.NumberFormat("pt-BR");

/** A count with its noun, singular for one: "1 produto", "12 produtos", "1.200 pedidos". */
export function countLabel(count: number, one: string, many: string): string {
  return `${countFormat.format(count)} ${count === 1 ? one : many}`;
}
