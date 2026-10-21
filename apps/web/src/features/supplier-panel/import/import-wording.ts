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
      ? ["atualizado pelo código", "atualizados pelo código"]
      : ["produto atualizado pelo código", "produtos atualizados pelo código"];
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

/**
 * The sentence after a confirmed import. Counts agree with their nouns ("1 linha com erro ficou
 * de fora", found testing PR #44), and new products are said to wait for review, as they do.
 */
export function importDoneSummary(
  result: {
    created: number;
    updated: number;
    pausedTargets: number;
    synchronizationQueued: boolean;
  },
  leftOutRows: number,
): string {
  const changes = [
    result.created > 0 ? plural(result.created, "produto novo", "produtos novos") : null,
    result.updated > 0 ? plural(result.updated, "atualizado", "atualizados") : null,
  ].filter((part) => part !== null);
  return [
    changes.length === 0 ? "Nenhum produto mudou." : `${changes.join(" e ")}.`,
    result.created > 0
      ? "Os novos passam pela análise antes de aparecer para os revendedores."
      : null,
    result.synchronizationQueued
      ? "Estoque enviado aos marketplaces."
      : "O estoque vai aos marketplaces na próxima sincronização.",
    result.pausedTargets > 0
      ? `${plural(result.pausedTargets, "anúncio pausado", "anúncios pausados")} sem estoque.`
      : null,
    leftOutRows > 0
      ? `${plural(leftOutRows, "linha com erro ficou", "linhas com erro ficaram")} de fora; corrija e envie de novo.`
      : null,
  ]
    .filter((sentence) => sentence !== null)
    .join(" ");
}
