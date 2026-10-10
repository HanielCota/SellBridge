/** "1 fornecedor", "12 fornecedores", with thousands grouped the Brazilian way. */
export function countLabel(count: number, one: string, many: string): string {
  return `${count.toLocaleString("pt-BR")} ${Math.abs(count) === 1 ? one : many}`;
}
