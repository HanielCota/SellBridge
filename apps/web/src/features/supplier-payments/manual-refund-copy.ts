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
