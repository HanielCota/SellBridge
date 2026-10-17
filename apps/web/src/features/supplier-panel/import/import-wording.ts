/** Sentences of the import screen that depend on counts, singular and plural done right. */

const count = new Intl.NumberFormat("pt-BR");

export function plural(amount: number, one: string, many: string): string {
  return `${count.format(amount)} ${amount === 1 ? one : many}`;
}

/** The explicit choice shown when some rows failed: what goes in and what stays out. */
export function onlyValidLabel(validRows: number, failedRows: number): string {
  const kept = validRows === 1 ? "a linha válida" : `as ${count.format(validRows)} linhas válidas`;
  const left = failedRows === 1 ? "a linha com erro" : `as ${count.format(failedRows)} com erro`;
  return `Importar só ${kept}, sem ${left}`;
}

/** What confirming does, leaving out the parts that are zero. */
export function confirmDescription(counts: {
  created: number;
  updated: number;
  failedRows: number;
}): string {
  // "produto" once, on the first part: "1 produto novo e 3 atualizados".
  const updatedNoun =
    counts.created > 0
      ? ["atualizado pelo SKU", "atualizados pelo SKU"]
      : ["produto atualizado pelo SKU", "produtos atualizados pelo SKU"];
  const changes = [
    counts.created > 0 ? plural(counts.created, "produto novo", "produtos novos") : null,
    counts.updated > 0 ? plural(counts.updated, updatedNoun[0] ?? "", updatedNoun[1] ?? "") : null,
  ].filter((part) => part !== null);
  const leftOut =
    counts.failedRows > 0
      ? `; ${plural(counts.failedRows, "linha com erro fica", "linhas com erro ficam")} de fora`
      : "";
  return `${changes.join(" e ")}${leftOut}.`;
}
