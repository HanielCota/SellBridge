import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import {
  addDays,
  addMonths,
  clampDay,
  daysBetween,
  FIRST_CALENDAR_DAY,
  monthWeeks,
  startOfMonth,
  toTime,
  weekdayOf,
} from "@/lib/calendar-dates";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export { addDays, daysBetween, startOfMonth } from "@/lib/calendar-dates";

const LAST_WEEKDAY = 6;

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

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function monthTitle(month: string): string {
  return capitalize(monthFormatter.format(toTime(month)));
}

/** Which way the view slides when it moves from one month to another. */
function slideDirection(from: string, to: string): -1 | 0 | 1 {
  if (to > from) {
    return 1;
  }
  return to < from ? -1 : 0;
}

/** The day a key moves the focus to (WAI-ARIA grid), or null for keys the grid ignores. */
function keyboardTarget(event: KeyboardEvent<HTMLTableElement>, focused: string): string | null {
  const moves: Record<string, () => string> = {
    ArrowLeft: () => addDays(focused, -1),
    ArrowRight: () => addDays(focused, 1),
    ArrowUp: () => addDays(focused, -7),
    ArrowDown: () => addDays(focused, 7),
    Home: () => addDays(focused, -weekdayOf(focused)),
    End: () => addDays(focused, LAST_WEEKDAY - weekdayOf(focused)),
    PageUp: () => addMonths(focused, event.shiftKey ? -12 : -1),
    PageDown: () => addMonths(focused, event.shiftKey ? 12 : 1),
  };
  return moves[event.key]?.() ?? null;
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

/** The month on screen and the way it last slid in. */
function useMonthView(initialMonth: string) {
  const [month, setMonth] = useState(initialMonth);
  const [direction, setDirection] = useState<-1 | 0 | 1>(0);
  function showMonth(next: string) {
    setDirection(slideDirection(month, next));
    setMonth(next);
  }
  return { month, direction, showMonth };
}

/**
 * Focus moved by the keyboard lands on its day button once that button is on screen (after a
 * month change too). Runs after every render and acts only when a move asked for it.
 */
function useGridFocus(focused: string) {
  const gridRef = useRef<HTMLTableElement>(null);
  const shouldFocus = useRef(false);
  useEffect(() => {
    if (!shouldFocus.current) {
      return;
    }
    shouldFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focused}"]`)?.focus();
  });
  return {
    gridRef,
    requestFocus: () => {
      shouldFocus.current = true;
    },
  };
}

/**
 * A range set from outside (e.g. "Mês passado") jumps the view to where it ends, unless that
 * month is already on screen. Adjusted during render to avoid a flash of the old month.
 */
function useFollowOutsideRange(
  value: DateRange,
  view: ReturnType<typeof useMonthView>,
  setFocused: (day: string) => void,
) {
  const valueKey = `${value.from}/${value.to}`;
  const [syncedKey, setSyncedKey] = useState(valueKey);
  if (syncedKey === valueKey) {
    return;
  }
  setSyncedKey(valueKey);
  if (value.to === null) {
    return;
  }
  const target = startOfMonth(value.to);
  if (target !== view.month && startOfMonth(value.from) !== view.month) {
    view.showMonth(target);
    setFocused(value.to);
  }
}

/**
 * A tap on a day: the first one starts a range, the second closes it in either direction. A
 * disabled day does nothing.
 */
function selectDay(context: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  isDisabled: (day: string) => boolean;
  setFocused: (day: string) => void;
  setHovered: (day: string | null) => void;
}) {
  const { value, onChange } = context;
  return (day: string) => {
    if (context.isDisabled(day)) {
      return;
    }
    context.setFocused(day);
    if (value.to !== null) {
      onChange({ from: day, to: null });
      return;
    }
    onChange(day < value.from ? { from: day, to: value.from } : { from: value.from, to: day });
    context.setHovered(null);
  };
}

/**
 * Two-tap range calendar: the first tap sets the start, the second closes the range
 * (in either direction). Keyboard follows the WAI-ARIA grid pattern.
 */
export function RangeCalendar({ value, onChange, max, maxDays, today }: RangeCalendarProps) {
  const view = useMonthView(startOfMonth(value.to ?? value.from));
  const [focused, setFocused] = useState(value.to ?? value.from);
  const [hovered, setHovered] = useState<string | null>(null);
  const { gridRef, requestFocus } = useGridFocus(focused);
  useFollowOutsideRange(value, view, setFocused);

  const picking = value.to === null;
  const isDisabled = (day: string) =>
    day > max ||
    day < FIRST_CALENDAR_DAY ||
    (picking && Math.abs(daysBetween(value.from, day)) >= maxDays);
  const select = selectDay({ value, onChange, isDisabled, setFocused, setHovered });

  function handleKeyDown(event: KeyboardEvent<HTMLTableElement>) {
    const next = keyboardTarget(event, focused);
    if (next === null) {
      return;
    }
    event.preventDefault();
    const clamped = clampDay(next, max);
    requestFocus();
    setFocused(clamped);
    if (startOfMonth(clamped) !== view.month) {
      view.showMonth(startOfMonth(clamped));
    }
    if (picking) {
      setHovered(next > max ? max : next);
    }
  }

  return (
    <div className="w-[17.5rem] select-none">
      <CalendarHeader month={view.month} max={max} onShowMonth={view.showMonth} />
      <MonthGrid
        view={view}
        gridRef={gridRef}
        onKeyDown={handleKeyDown}
        onPointerLeave={() => setHovered(null)}
        day={{
          value,
          hovered,
          focused,
          today,
          picking,
          isDisabled,
          select,
          setFocused,
          setHovered,
        }}
      />
    </div>
  );
}

function CalendarHeader({
  month,
  max,
  onShowMonth,
}: {
  month: string;
  max: string;
  onShowMonth: (month: string) => void;
}) {
  const nextMonth = startOfMonth(month, 1);
  const previousMonth = startOfMonth(month, -1);
  return (
    <div className="mb-2 flex items-center justify-between pl-2">
      <h2 aria-live="polite" className="text-subhead font-semibold tracking-tight">
        {monthTitle(month)}
      </h2>
      <div className="flex items-center">
        <MonthButton
          label="Mês anterior"
          disabled={previousMonth < startOfMonth(FIRST_CALENDAR_DAY)}
          onClick={() => onShowMonth(previousMonth)}
        >
          <CaretLeftIcon weight="bold" />
        </MonthButton>
        <MonthButton
          label="Próximo mês"
          disabled={nextMonth > max}
          onClick={() => onShowMonth(nextMonth)}
        >
          <CaretRightIcon weight="bold" />
        </MonthButton>
      </div>
    </div>
  );
}

/** What every day cell reads: the selection, the pointer preview and the grid's handlers. */
interface DayContext {
  value: DateRange;
  hovered: string | null;
  focused: string;
  today: string;
  picking: boolean;
  isDisabled: (day: string) => boolean;
  select: (day: string) => void;
  setFocused: (day: string) => void;
  setHovered: (day: string | null) => void;
}

function MonthGrid({
  view,
  gridRef,
  onKeyDown,
  onPointerLeave,
  day,
}: {
  view: ReturnType<typeof useMonthView>;
  gridRef: React.RefObject<HTMLTableElement | null>;
  onKeyDown: (event: KeyboardEvent<HTMLTableElement>) => void;
  onPointerLeave: () => void;
  day: DayContext;
}) {
  const { month, direction } = view;
  const tabStop = startOfMonth(day.focused) === month ? day.focused : month;
  return (
    <table
      ref={gridRef}
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role -- the WAI-ARIA date picker is a table with the grid role, so screen readers take arrow keys
      role="grid"
      aria-multiselectable="true"
      aria-label={monthTitle(month)}
      onKeyDown={onKeyDown}
      onPointerLeave={onPointerLeave}
      className="w-full border-collapse"
    >
      <WeekdayHeader />
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
            {week.map((cell, index) =>
              cell === null ? (
                <td key={`empty-${index}`} aria-hidden="true" />
              ) : (
                <DayCell key={cell} day={cell} column={index} tabStop={tabStop} context={day} />
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function WeekdayHeader() {
  return (
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
  );
}

/** The selected range, or the one the pointer previews while the second tap is pending. */
function visibleRange(context: DayContext): { start: string; end: string } {
  const { value, hovered, picking } = context;
  const preview = picking && hovered ? hovered : value.to;
  if (preview && preview < value.from) {
    return { start: preview, end: value.from };
  }
  return { start: value.from, end: preview ?? value.from };
}

function DayCell({
  day,
  column,
  tabStop,
  context,
}: {
  day: string;
  column: number;
  tabStop: string;
  context: DayContext;
}) {
  const range = visibleRange(context);
  const inRange = day >= range.start && day <= range.end;
  const isStart = day === range.start;
  const isEnd = day === range.end;
  return (
    <td aria-selected={inRange} className="relative p-0 py-0.5">
      {inRange && range.start !== range.end ? (
        <RangeBand day={day} column={column} isStart={isStart} isEnd={isEnd} />
      ) : null}
      <DayButton
        day={day}
        tabStop={tabStop}
        isEndpoint={(isStart || isEnd) && (!context.picking || day === context.value.from)}
        context={context}
      />
    </td>
  );
}

/**
 * The tinted band behind the days of the range. Rounded only where the range really ends or the
 * row wraps; where it runs into another month it fades out, so it doesn't read as an endpoint.
 */
function RangeBand({
  day,
  column,
  isStart,
  isEnd,
}: {
  day: string;
  column: number;
  isStart: boolean;
  isEnd: boolean;
}) {
  const continuesBefore = !isStart && day.endsWith("-01");
  const continuesAfter = !isEnd && addDays(day, 1).endsWith("-01");
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute inset-y-0.5 inset-x-0 bg-brand/15",
        continuesBefore
          ? cn(
              "[mask-image:linear-gradient(to_right,transparent,black_75%)]",
              column !== 0 && "-left-3",
            )
          : (isStart || column === 0) && "left-0.5 rounded-l-full",
        continuesAfter
          ? cn(
              "[mask-image:linear-gradient(to_left,transparent,black_75%)]",
              column !== LAST_WEEKDAY && "-right-3",
            )
          : (isEnd || column === LAST_WEEKDAY) && "right-0.5 rounded-r-full",
      )}
    />
  );
}

function DayButton({
  day,
  tabStop,
  isEndpoint,
  context,
}: {
  day: string;
  tabStop: string;
  isEndpoint: boolean;
  context: DayContext;
}) {
  const disabled = context.isDisabled(day);
  return (
    <button
      type="button"
      data-day={day}
      tabIndex={day === tabStop ? 0 : -1}
      disabled={disabled}
      aria-label={capitalize(dayLabelFormatter.format(toTime(day)))}
      aria-current={day === context.today ? "date" : undefined}
      onClick={() => context.select(day)}
      onPointerEnter={() => {
        if (context.picking && !disabled) context.setHovered(day);
      }}
      onFocus={() => context.setFocused(day)}
      className={cn(
        "relative mx-auto flex size-9 items-center justify-center rounded-full text-subhead tabular-nums transition-[background-color,color,transform] duration-100 outline-none active:scale-90 motion-reduce:active:scale-100",
        "hover:bg-foreground/8 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
        "disabled:pointer-events-none disabled:text-muted-foreground/40",
        day === context.today && "font-semibold text-brand-text dark:text-brand",
        isEndpoint && "bg-brand font-semibold text-brand-ink hover:bg-brand dark:text-brand-ink",
      )}
    >
      {Number(day.slice(8))}
    </button>
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
