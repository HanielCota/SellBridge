import { RESPONSE_TARGET_HOURS, type TicketPriority } from "@sellbridge/shared/ticket-rules";

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

/** "40 min", "3 h", "2 dias": rounded to what a person plans around. */
export function formatDuration(milliseconds: number): string {
  const minutes = Math.max(1, Math.round(milliseconds / MINUTE));
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.round(milliseconds / HOUR);
  if (hours < 48) {
    return `${hours} h`;
  }
  const days = Math.round(hours / 24);
  return `${days} dias`;
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

/** "Respondemos em até 24 horas" for the new-ticket form, before any ticket exists. */
export function responseTargetText(priority: TicketPriority): string {
  const hours = RESPONSE_TARGET_HOURS[priority];
  return `Respondemos em até ${hours} ${hours === 1 ? "hora" : "horas"}`;
}

/** "1 chamado com resposta nova", "3 chamados com resposta nova": counts tickets, not messages. */
export function unreadRepliesText(tickets: number): string {
  return tickets === 1 ? "1 chamado com resposta nova" : `${tickets} chamados com resposta nova`;
}
