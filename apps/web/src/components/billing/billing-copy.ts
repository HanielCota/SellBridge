import { formatCents } from "@sellbridge/shared/money";
import { REPORT_TIME_ZONE } from "@sellbridge/shared/period-range";

export function dateLabel(isoDate: string | Date): string {
  return new Date(isoDate).toLocaleDateString("pt-BR", { timeZone: REPORT_TIME_ZONE });
}

/** The access ends at a moment; the reseller keeps the whole day before it. */
export function lastDayLabel(isoDate: string): string {
  return dateLabel(new Date(new Date(isoDate).getTime() - 1));
}

/** How cancelling ends, as the server tells it before the reseller confirms. */
interface CancelTerms {
  endsAt: string | null;
  refundCents: number | null;
  /** The plan went up after the first fee: what was paid to go up is not given back. */
  keepsUpgradeDifference?: boolean;
}

const DIFFERENCE_STAYS =
  "Só essa primeira mensalidade volta: o que você pagou a mais para subir de plano não é devolvido.";

const AFTER_THE_PLAN =
  "Depois disso, os anúncios no ar e os envios em andamento continuam. Para registrar ou encaminhar novas vendas, conectar lojas ou publicar anúncios, você precisa de um plano ativo.";

/** What cancelling does, in the reseller's words, before confirming. */
export function cancelCopy(terms: CancelTerms): string {
  if (terms.refundCents !== null) {
    const refund = `Como é a sua primeira mensalidade e você pagou há 7 dias ou menos, devolvemos ${formatCents(terms.refundCents)} inteiro pelo Asaas.`;
    const difference = terms.keepsUpgradeDifference === true ? ` ${DIFFERENCE_STAYS}` : "";
    return `${refund}${difference} O plano acaba agora. ${AFTER_THE_PLAN}`;
  }
  const until = terms.endsAt === null ? "o fim do mês pago" : lastDayLabel(terms.endsAt);
  return `Seu plano vale até ${until} e não renova. ${AFTER_THE_PLAN}`;
}

export function cancelledMessage(result: CancelTerms): string {
  if (result.refundCents !== null) {
    return `Assinatura cancelada. Devolvemos ${formatCents(result.refundCents)} pelo Asaas.`;
  }
  if (result.endsAt === null) return "Assinatura cancelada.";
  return `Assinatura cancelada. Seu plano vale até ${lastDayLabel(result.endsAt)}.`;
}

/** The paid days an account deletion gives up, with no refund. */
export function paidDaysSentence(days: number, planName: string): string {
  const paid = days === 1 ? "1 dia pago" : `${days} dias pagos`;
  const lost = days === 1 ? "esse dia" : "esses dias";
  return `Você ainda tem ${paid} do plano ${planName}. Se excluir a conta agora, perde ${lost}.`;
}
