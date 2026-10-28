const HOURS_PER_DAY = 24;

/** Days a supplier picks on "Dados da marca"; the database keeps hours (migration 0029). */
export const ACCEPT_DAY_CHOICES = [1, 2, 3] as const;
export const DISPATCH_DAY_CHOICES = [1, 2, 3, 5] as const;

const WEEKDAYS = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"] as const;

/** "1 dia", "3 dias"; hours the team set by hand that are not whole days stay in hours. */
export function deadlineLabel(hours: number): string {
  if (hours % HOURS_PER_DAY !== 0) {
    return hours === 1 ? "1 hora" : `${hours} horas`;
  }
  const days = hours / HOURS_PER_DAY;
  return days === 1 ? "1 dia" : `${days} dias`;
}

/**
 * The options as hours, always holding the saved value: a deadline the team set by hand (say
 * 12 h) shows as its own option instead of silently jumping to a day. Options below `minimumHours`
 * are left out, so dispatch never comes before accept.
 */
export function deadlineOptions(
  dayChoices: readonly number[],
  currentHours: number,
  minimumHours = 0,
): string[] {
  const hours = dayChoices.map((days) => days * HOURS_PER_DAY);
  const withCurrent = hours.includes(currentHours) ? hours : [...hours, currentHours];
  return withCurrent
    .filter((option) => option >= minimumHours)
    .toSorted((first, second) => first - second)
    .map(String);
}

/** Accepting later than the dispatch deadline is refused, so dispatch moves up with it. */
export function dispatchAfterAccept(acceptHours: number, dispatchHours: number): number {
  return Math.max(acceptHours, dispatchHours);
}

function deadlineWeekday(daysAfterMonday: number): string {
  const weekday = WEEKDAYS[daysAfterMonday % WEEKDAYS.length] ?? WEEKDAYS[0];
  const weeks = Math.floor(daysAfterMonday / WEEKDAYS.length);
  if (weeks === 0) {
    return weekday;
  }
  if (weeks === 1) {
    return `${weekday} da semana seguinte`;
  }
  return `${weekday} daqui a ${weeks} semanas`;
}

function deadlineMoment(hoursAfterMonday10: number): string {
  const elapsedHours = 10 + hoursAfterMonday10;
  const days = Math.floor(elapsedHours / HOURS_PER_DAY);
  return `${deadlineWeekday(days)} às ${elapsedHours % HOURS_PER_DAY}h`;
}

/** A worked example of both deadlines, counted from an order forwarded on Monday at 10h. */
export function deadlineExample(acceptHours: number, dispatchHours: number): string {
  return `Exemplo: pedido encaminhado na segunda às 10h → aceitar até ${deadlineMoment(acceptHours)} e despachar até ${deadlineMoment(dispatchHours)}.`;
}
