import { formatRelativeTime } from "@/lib/relative-time";

/** Where a preview's Mercado Livre numbers came from, as the server read them. */
export interface RatesSource {
  liveCommission: boolean;
  liveShipping: boolean;
  /** ISO 8601; null when nothing came from Mercado Livre. */
  readAt: string | null;
}

const ESTIMATE_NOTE =
  "Estimativa: a comissão depende da categoria do anúncio, e o frete, do peso do produto e da reputação da loja.";

/** The line under a profit preview saying how sure its fees are, in the reseller's words. */
export function ratesNote(source: RatesSource | null, now: Date = new Date()): string {
  if (source === null || source.readAt === null) {
    return ESTIMATE_NOTE;
  }
  const when = formatRelativeTime(new Date(source.readAt), now);
  if (source.liveCommission && source.liveShipping) {
    return `Comissão e frete da sua loja no Mercado Livre, consultados ${when}.`;
  }
  if (source.liveCommission) {
    return `Comissão da sua loja no Mercado Livre, consultada ${when}. O frete é estimado pelo peso do produto: faltam as medidas da embalagem ou o Mercado Livre não respondeu.`;
  }
  if (source.liveShipping) {
    return `Frete da sua loja no Mercado Livre, consultado ${when}. A comissão é estimada: falta a categoria do produto no Mercado Livre ou ele não respondeu.`;
  }
  return ESTIMATE_NOTE;
}
