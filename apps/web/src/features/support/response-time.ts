import type { TicketStatus } from "@sellbridge/shared/schemas";
import { isWithinSupportHours, SUPPORT_HOURS } from "@sellbridge/shared/support-hours";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const TIME_ZONE = "America/Sao_Paulo";

const timeOfDay = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});
const dayAndMonth = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: TIME_ZONE,
});

/**
 * "40 min", "3 h", "2 dias": rounded to what a person plans around. `round` picks the direction;
 * time left uses `Math.floor`, so "Vence em 2 h" never shows when only 1h31 is left.
 */
export function formatDuration(
  milliseconds: number,
  round: (value: number) => number = Math.round,
): string {
  const minutes = Math.max(1, round(milliseconds / MINUTE));
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = round(milliseconds / HOUR);
  if (hours < 48) {
    return `${hours} h`;
  }
  const days = round(hours / 24);
  return `${days} dias`;
}

/**
 * The deadline line of the team's panel, or null when the live "Vence em" badge applies. A reply
 * sent with "Enviar e manter aguardando" leaves the ticket open with no clock running; the panel
 * said "Aguardando o revendedor" under an "Aguardando suporte" badge.
 */
export function staffResponseStateText(
  status: TicketStatus,
  awaitingSince: Date | null,
): string | null {
  if (status === "closed") {
    return "Encerrado";
  }
  if (status === "answered") {
    return "Aguardando o revendedor";
  }
  if (awaitingSince === null) {
    return "Sem prazo: o cliente já recebeu uma resposta";
  }
  return null;
}

/** "hoje às 14:30", "amanhã às 09:00" or "15/10 às 09:00", in Brasília time. */
export function formatDeadline(date: Date, now: Date = new Date()): string {
  const time = timeOfDay.format(date);
  const day = dayAndMonth.format(date);
  if (day === dayAndMonth.format(now)) {
    return `hoje às ${time}`;
  }
  if (day === dayAndMonth.format(new Date(now.getTime() + 24 * HOUR))) {
    return `amanhã às ${time}`;
  }
  return `${day} às ${time}`;
}

const { opensAtHour, closesAtHour } = SUPPORT_HOURS;

/** The one line about when support answers, the same on every customer screen. */
export const SUPPORT_HOURS_TEXT = `Atendimento todos os dias, das ${opensAtHour}h às ${closesAtHour}h (horário de Brasília).`;

/**
 * Outside the hours, when answers start again, so a ticket opened at night does not wait for an
 * answer that night; null while the team is at work. Tickets can be opened at any time.
 */
export function outOfHoursNotice(now: Date): string | null {
  if (isWithinSupportHours(now)) {
    return null;
  }
  return `Estamos fora do horário. Respondemos a partir das ${opensAtHour}h.`;
}

/** The hours and, outside them, the notice, for screens with a single line of text. */
export function supportHoursText(now: Date): string {
  const notice = outOfHoursNotice(now);
  if (notice === null) {
    return SUPPORT_HOURS_TEXT;
  }
  return `${SUPPORT_HOURS_TEXT} ${notice}`;
}

/** "1 chamado com resposta nova", "3 chamados com resposta nova": counts tickets, not messages. */
export function unreadRepliesText(tickets: number): string {
  return tickets === 1 ? "1 chamado com resposta nova" : `${tickets} chamados com resposta nova`;
}
