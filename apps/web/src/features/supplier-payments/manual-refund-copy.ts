import { REPORT_TIME_ZONE } from "@sellbridge/shared/period-range";

const fullDay = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: REPORT_TIME_ZONE,
});

/**
 * The team's deadline for a refund made by hand: until when, or that Asaas already released the
 * money to the supplier, in which case the steps at Asaas no longer apply.
 */
export function manualRefundDeadlineLine(
  lastMoment: Date,
  now: Date,
): { passed: boolean; text: string } {
  const day = fullDay.format(lastMoment);
  if (now.getTime() > lastMoment.getTime()) {
    return {
      passed: true,
      text: `O prazo acabou em ${day} e o Asaas já liberou o valor ao fornecedor. Combine com ele como devolver ao revendedor.`,
    };
  }
  return {
    passed: false,
    text: `Devolva até ${day}. Depois dessa data o Asaas libera o valor ao fornecedor.`,
  };
}

/** The last day as the team reads it in the facts: "19/12/2026". */
export function manualRefundDayLabel(lastMoment: Date): string {
  return fullDay.format(lastMoment);
}

/**
 * Why the refund did not go through on its own. A Pix refund needs the whole amount free in the
 * supplier's account, which the fee and the guarantee leave short; a card one is refused for
 * reasons Asaas gives case by case.
 */
export function manualRefundExplanation(paidByPix: boolean): string {
  if (paidByPix) {
    return "O Asaas só devolve um Pix quando a conta do fornecedor tem o valor inteiro livre. A taxa do SellBridge já saiu dessa conta e o resto está guardado, então a devolução não sai sozinha: alguém da equipe faz no Asaas.";
  }
  return "O Asaas não aceitou devolver este pagamento no cartão. O motivo que ele deu está nos detalhes técnicos, mais abaixo. Alguém da equipe confere e faz a devolução no Asaas.";
}
