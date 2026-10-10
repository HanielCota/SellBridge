import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

/**
 * Calendar dates are handled as ISO strings (YYYY-MM-DD) and computed in UTC, so the
 * browser's own time zone never shifts a day.
 */
const DAY_MILLISECONDS = 86_400_000;

const monthFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const dayLabelFormatter = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const WEEKDAYS = [
  { short: "D", long: "domingo" },
  { short: "S", long: "segunda-feira" },
  { short: "T", long: "terça-feira" },
  { short: "Q", long: "quarta-feira" },
  { short: "Q", long: "quinta-feira" },
  { short: "S", long: "sexta-feira" },
  { short: "S", long: "sábado" },
];

function toTime(iso: string): number {
  return Date.parse(`${iso}T00:00:00.000Z`);
}

function fromTime(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return fromTime(toTime(iso) + days * DAY_MILLISECONDS);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toTime(to) - toTime(from)) / DAY_MILLISECONDS);
}

/** First day of the month containing `iso`, shifted by `delta` months. */
export function startOfMonth(iso: string, delta = 0): string {
  const date = new Date(toTime(iso));
  return fromTime(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1));
}

/** Same day-of-month `delta` months away, clamped to the target month's length. */
function addMonths(iso: string, delta: number): string {
  const date = new Date(toTime(iso));
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return fromTime(target.getTime());
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Weeks of the month, with `null` padding outside it (Apple hides adjacent-month days). */
function monthWeeks(month: string): (string | null)[][] {
  const first = new Date(toTime(month));
  const daysInMonth = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: first.getUTCDay() }, () => null);
  for (let day = 0; day < daysInMonth; day++) {
    cells.push(addDays(month, day));
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  const weeks: (string | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

export interface DateRange {
  from: string;
  to: string | null;
}

interface RangeCalendarProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  /** Latest selectable day (inclusive). */
  max: string;
  /** Longest allowed range, in days (inclusive). */
  maxDays: number;
  today: string;
}

/**
 * Two-tap range calendar: the first tap sets the start, the second closes the range
 * (in either direction). Keyboard follows the WAI-ARIA grid pattern.
 */
export function RangeCalendar({ value, onChange, max, maxDays, today }: RangeCalendarProps) {
  const [month, setMonth] = useState(() => startOfMonth(value.to ?? value.from));
  const [direction, setDirection] = useState<-1 | 0 | 1>(0);
  const [focused, setFocused] = useState(value.to ?? value.from);
  const [hovered, setHovered] = useState<string | null>(null);
  const gridRef = useRef<HTMLTableElement>(null);
  const shouldFocus = useRef(false);

  const picking = value.to === null;
  const preview = picking && hovered ? hovered : value.to;
  const [rangeStart, rangeEnd] =
    preview && preview < value.from ? [preview, value.from] : [value.from, preview ?? value.from];

  // A range set from outside (e.g. "Mês passado") jumps the view to where it ends, unless
  // that month is already on screen. Adjusted during render to avoid a flash of the old month.
  const valueKey = `${value.from}/${value.to}`;
  const [syncedKey, setSyncedKey] = useState(valueKey);
  if (syncedKey !== valueKey) {
    setSyncedKey(valueKey);
    if (value.to !== null) {
      const target = startOfMonth(value.to);
      if (target !== month && startOfMonth(value.from) !== month) {
        setDirection(target > month ? 1 : -1);
        setMonth(target);
        setFocused(value.to);
      }
    }
  }

  useEffect(() => {
    if (!shouldFocus.current) {
      return;
    }
    shouldFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focused}"]`)?.focus();
  }, [focused, month]);

  function isDisabled(day: string): boolean {
    if (day > max) {
      return true;
    }
    return picking && Math.abs(daysBetween(value.from, day)) >= maxDays;
  }

  function showMonth(next: string) {
    setDirection(next > month ? 1 : next < month ? -1 : 0);
    setMonth(next);
  }

  function moveFocus(day: string) {
    const clamped = day > max ? max : day;
    shouldFocus.current = true;
    setFocused(clamped);
    const target = startOfMonth(clamped);
    if (target !== month) {
      showMonth(target);
    }
  }

  function select(day: string) {
    if (isDisabled(day)) {
      return;
    }
    setFocused(day);
    if (!picking) {
      onChange({ from: day, to: null });
      return;
    }
    onChange(day < value.from ? { from: day, to: value.from } : { from: value.from, to: day });
    setHovered(null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTableElement>) {
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      Home: () => addDays(focused, -new Date(toTime(focused)).getUTCDay()),
      End: () => addDays(focused, 6 - new Date(toTime(focused)).getUTCDay()),
      PageUp: () => addMonths(focused, event.shiftKey ? -12 : -1),
      PageDown: () => addMonths(focused, event.shiftKey ? 12 : 1),
    };
    const move = moves[event.key];
    if (!move) {
      return;
    }
    event.preventDefault();
    const next = move();
    moveFocus(next);
    if (picking) {
      setHovered(next > max ? max : next);
    }
  }

  const focusedInView = startOfMonth(focused) === month;
  const tabStop = focusedInView ? focused : month;
  const nextMonth = startOfMonth(month, 1);

  return (
    <div className="w-[17.5rem] select-none">
      <div className="mb-2 flex items-center justify-between pl-2">
        <h2 aria-live="polite" className="text-subhead font-semibold tracking-tight">
          {capitalize(monthFormatter.format(toTime(month)))}
        </h2>
        <div className="flex items-center">
          <MonthButton label="Mês anterior" onClick={() => showMonth(startOfMonth(month, -1))}>
            <CaretLeftIcon weight="bold" />
          </MonthButton>
          <MonthButton
            label="Próximo mês"
            disabled={nextMonth > max}
            onClick={() => showMonth(nextMonth)}
          >
            <CaretRightIcon weight="bold" />
          </MonthButton>
        </div>
      </div>

      <table
        ref={gridRef}
        role="grid"
        aria-multiselectable="true"
        aria-label={capitalize(monthFormatter.format(toTime(month)))}
        onKeyDown={handleKeyDown}
        onPointerLeave={() => setHovered(null)}
        className="w-full border-collapse"
      >
        <thead>
          <tr>
            {WEEKDAYS.map((weekday) => (
              <th
                key={weekday.long}
                scope="col"
                abbr={weekday.long}
                className="h-7 text-xs font-semibold tracking-wide text-muted-foreground"
              >
                <span aria-hidden="true">{weekday.short}</span>
                <span className="sr-only">{weekday.long}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody
          key={month}
          className={cn(
            "duration-200 ease-out motion-reduce:slide-in-from-left-0 motion-reduce:slide-in-from-right-0",
            direction !== 0 && "animate-in fade-in-0",
            direction === 1 && "slide-in-from-right-3",
            direction === -1 && "slide-in-from-left-3",
          )}
        >
          {monthWeeks(month).map((week) => (
            <tr key={week.find(Boolean)}>
              {week.map((day, index) => {
                if (!day) {
                  return <td key={`empty-${index}`} aria-hidden="true" />;
                }
                const inRange = day >= rangeStart && day <= rangeEnd;
                const isStart = day === rangeStart;
                const isEnd = day === rangeEnd;
                const isEndpoint = (isStart || isEnd) && (!picking || day === value.from);
                const single = rangeStart === rangeEnd;
                const disabled = isDisabled(day);
                const continuesBefore = !isStart && day.endsWith("-01");
                const continuesAfter = !isEnd && addDays(day, 1).endsWith("-01");
                return (
                  <td
                    key={day}
                    role="gridcell"
                    aria-selected={inRange}
                    className="relative p-0 py-0.5"
                  >
                    {inRange && !single ? (
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute inset-y-0.5 inset-x-0 bg-brand/15",
                          // Round only where the range really ends or the row wraps; where it
                          // runs into another month, fade out so it doesn't read as an endpoint.
                          continuesBefore
                            ? cn(
                                "[mask-image:linear-gradient(to_right,transparent,black_75%)]",
                                index !== 0 && "-left-3",
                              )
                            : (isStart || index === 0) && "left-0.5 rounded-l-full",
                          continuesAfter
                            ? cn(
                                "[mask-image:linear-gradient(to_left,transparent,black_75%)]",
                                index !== 6 && "-right-3",
                              )
                            : (isEnd || index === 6) && "right-0.5 rounded-r-full",
                        )}
                      />
                    ) : null}
                    <button
                      type="button"
                      data-day={day}
                      tabIndex={day === tabStop ? 0 : -1}
                      disabled={disabled}
                      aria-label={capitalize(dayLabelFormatter.format(toTime(day)))}
                      aria-current={day === today ? "date" : undefined}
                      onClick={() => select(day)}
                      onPointerEnter={() => picking && !disabled && setHovered(day)}
                      onFocus={() => setFocused(day)}
                      className={cn(
                        "relative mx-auto flex size-9 items-center justify-center rounded-full text-subhead tabular-nums transition-[background-color,color,transform] duration-100 outline-none active:scale-90 motion-reduce:active:scale-100",
                        "hover:bg-foreground/8 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
                        "disabled:pointer-events-none disabled:text-muted-foreground/40",
                        day === today && "font-semibold text-brand-text dark:text-brand",
                        isEndpoint &&
                          "bg-brand font-semibold text-brand-ink hover:bg-brand dark:text-brand-ink",
                      )}
                    >
                      {Number(day.slice(8))}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonthButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-full text-brand-text transition-[background-color,transform] duration-100 outline-none hover:bg-foreground/8 focus-visible:ring-2 focus-visible:ring-brand active:scale-90 disabled:text-muted-foreground/40 motion-reduce:active:scale-100 dark:text-brand [&_svg]:size-4"
    >
      {children}
    </button>
  );
}
