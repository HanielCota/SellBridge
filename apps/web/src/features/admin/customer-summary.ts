const wholeNumber = new Intl.NumberFormat("pt-BR");

/** What the customers page's headline needs from the list. */
export interface CustomerCounts {
  customerCount: number;
  needingAttention: number;
  /** How many accounts the ranking stopped at (the newest ones), or null when it holds all. */
  rankingLimit: number | null;
}

function countLine(counts: CustomerCounts): string {
  const customers = `${counts.customerCount} ${counts.customerCount === 1 ? "cliente" : "clientes"}`;
  if (counts.needingAttention === 0) {
    return `${customers}, todos em dia.`;
  }
  const verb = counts.needingAttention === 1 ? "precisa" : "precisam";
  return `${customers} · ${counts.needingAttention} ${verb} de atenção agora.`;
}

/**
 * The headline above the customers table. When the ranking was cut it says so: the count would
 * otherwise read as the whole base while the oldest accounts, the likeliest to leave, are missing.
 */
export function attentionSummary(counts: CustomerCounts): string {
  const line = countLine(counts);
  if (counts.rankingLimit === null) {
    return line;
  }
  return `${line} Mostrando só as ${wholeNumber.format(counts.rankingLimit)} contas mais recentes; busque pelo nome ou e-mail para achar as outras.`;
}
