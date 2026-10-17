/** Sentences of the import screen that depend on counts, singular and plural done right. */

const count = new Intl.NumberFormat("pt-BR");

export function plural(amount: number, one: string, many: string): string {
  return `${count.format(amount)} ${amount === 1 ? one : many}`;
}

/** The explicit choice shown when some rows failed: what goes in and what stays out. */
export function onlyValidLabel(validRows: number, failedRows: number): string {
  const kept = validRows === 1 ? "a linha válida" : `as ${count.format(validRows)} linhas válidas`;
  const left =
    failedRows === 1
      ? "A linha com erro fica de fora"
      : `As ${count.format(failedRows)} linhas com erro ficam de fora`;
  return `Importar só ${kept}. ${left} até você corrigir e enviar de novo.`;
}

/** What confirming does, leaving out the parts that are zero. */
export function confirmDescription(counts: {
  created: number;
  updated: number;
  failedRows: number;
}): string {
  const changes = [
    counts.created > 0
      ? plural(counts.created, "produto novo será criado", "produtos novos serão criados")
      : null,
    counts.updated > 0
      ? plural(
          counts.updated,
          "produto existente será atualizado",
          "produtos existentes serão atualizados",
        )
      : null,
  ].filter((part) => part !== null);
  const leftOut =
    counts.failedRows > 0
      ? ` ${plural(counts.failedRows, "linha com erro não será importada", "linhas com erro não serão importadas")}.`
      : "";
  return `${changes.join(" e ")}, pelo SKU, com estoque e custo da planilha.${leftOut}`;
}
