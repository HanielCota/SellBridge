/** Sentences of the import screen that depend on counts, singular and plural done right. */

const count = new Intl.NumberFormat("pt-BR");

export function plural(amount: number, one: string, many: string): string {
  return `${count.format(amount)} ${amount === 1 ? one : many}`;
}

/**
 * The import button, saying what happens to each kind of product: "Importar 5 produtos" read as
 * five new ones when three were new and two only updated.
 */
export function importActionLabel(counts: { created: number; updated: number }): string {
  const { created, updated } = counts;
  if (created > 0 && updated > 0) {
    return `Importar ${plural(created, "novo", "novos")} e atualizar ${count.format(updated)}`;
  }
  if (created > 0) {
    return `Importar ${plural(created, "produto novo", "produtos novos")}`;
  }
  if (updated > 0) {
    return `Atualizar ${plural(updated, "produto", "produtos")}`;
  }
  return "Importar";
}

/** The explicit choice shown when some rows failed: what goes in and what stays out. */
export function onlyValidLabel(validRows: number, failedRows: number): string {
  const kept = validRows === 1 ? "a linha válida" : `as ${count.format(validRows)} linhas válidas`;
  const left = failedRows === 1 ? "a linha com erro" : `as ${count.format(failedRows)} com erro`;
  return `Importar só ${kept}, sem ${left}`;
}

/**
 * Whether importing asks first. Only new products change nothing that exists, so they go in on
 * one click; updating products or leaving rows with errors out shows what happens before.
 */
export function importNeedsConfirmation(counts: { updated: number; failedRows: number }): boolean {
  return counts.updated > 0 || counts.failedRows > 0;
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
      ? "Os novos completos já aparecem para os revendedores; os com pendência ficam como rascunho."
      : null,
    result.synchronizationQueued
      ? "Estoque enviado aos marketplaces."
      : "O estoque chega aos anúncios na próxima atualização automática.",
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
