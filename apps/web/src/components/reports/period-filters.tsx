import {
  PERIOD_PRESETS,
  REPORT_TIME_ZONE,
  type PeriodPreset,
  type PeriodSearch,
} from "@sellbridge/shared/schemas";
import { cn } from "@/lib/utils";
import { useState, type ComponentProps } from "react";
import { CalendarBlankIcon, CaretDownIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  addDays,
  daysBetween,
  RangeCalendar,
  startOfMonth,
  type DateRange,
} from "@/components/ui/range-calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_STORES = "__all__";

/** Short labels for the segmented control (the long ones live in PERIOD_LABELS). */
const SEGMENT_LABELS: Record<PeriodPreset, string> = {
  "7d": "7 dias",
  "30d": "30 dias",
  "90d": "90 dias",
  "180d": "6 meses",
  custom: "Personalizado",
};

interface PeriodFiltersProps {
  search: PeriodSearch;
  stores: { id: string; name: string }[];
  resolvedFrom: string;
  resolvedTo: string;
  onChange: (patch: Partial<PeriodSearch>) => void;
}

export function PeriodFilters({
  search,
  stores,
  resolvedFrom,
  resolvedTo,
  onChange,
}: PeriodFiltersProps) {
  // Opens the calendar right away when the user picks "Personalizado", not on page load.
  const [openCalendar, setOpenCalendar] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <PeriodSegments
          period={search.period}
          onPeriodChange={(period) => {
            setOpenCalendar(period === "custom");
            onChange(
              period === "custom"
                ? { period, from: resolvedFrom, to: resolvedTo }
                : { period, from: undefined, to: undefined },
            );
          }}
        />
        <StoreSelect
          store={search.store}
          stores={stores}
          onStoreChange={(store) => onChange({ store })}
        />
      </div>
      {search.period === "custom" ? (
        <CustomRange
          key={`${resolvedFrom}-${resolvedTo}`}
          from={resolvedFrom}
          to={resolvedTo}
          defaultOpen={openCalendar}
          onOpenChange={setOpenCalendar}
          onApply={(from, to) => onChange({ period: "custom", from, to })}
        />
      ) : null}
    </div>
  );
}

/** One-click period choice: native radios styled as a segmented control. */
function PeriodSegments({
  period,
  onPeriodChange,
}: {
  period: PeriodSearch["period"];
  onPeriodChange: (period: PeriodPreset) => void;
}) {
  return (
    <fieldset className="flex w-full overflow-x-auto rounded-lg bg-muted p-0.5 [scrollbar-width:none] sm:inline-flex sm:w-auto">
      <legend className="sr-only">Período</legend>
      {PERIOD_PRESETS.map((preset) => (
        <label
          key={preset}
          className={cn(
            "flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-md px-3 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground sm:flex-none sm:text-sm",
            "has-checked:bg-card has-checked:text-foreground has-checked:shadow-sm",
            "has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
          )}
        >
          <input
            type="radio"
            name="period"
            value={preset}
            checked={preset === period}
            onChange={() => onPeriodChange(preset)}
            className="sr-only"
          />
          {SEGMENT_LABELS[preset]}
        </label>
      ))}
    </fieldset>
  );
}

function StoreSelect({
  store,
  stores,
  onStoreChange,
}: {
  store: PeriodSearch["store"];
  stores: PeriodFiltersProps["stores"];
  onStoreChange: (store: string | undefined) => void;
}) {
  return (
    <Select
      value={store ?? ALL_STORES}
      onValueChange={(value) => onStoreChange(value === ALL_STORES ? undefined : value)}
    >
      <SelectTrigger aria-label="Loja" className="h-9 w-full min-w-44 sm:w-auto">
        <SelectValue>
          {stores.find((option) => option.id === store)?.name ?? "Todas as lojas"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_STORES}>Todas as lojas</SelectItem>
        {stores.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const MAX_CUSTOM_DAYS = 366;

const rangeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function isoTime(iso: string): number {
  return Date.parse(`${iso}T00:00:00.000Z`);
}

/** Today's calendar date in Brazil, the same calendar the reports use. */
function brazilToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: REPORT_TIME_ZONE }).format(new Date());
}

/**
 * Node and browsers ship different ICU data: one separates "1 – 30" with thin spaces, the
 * other with plain ones. Normalizing keeps the server HTML equal to the client render.
 */
function formatRange(from: string, to: string): string {
  return rangeFormatter.formatRange(isoTime(from), isoTime(to)).replace(/\s+/g, " ");
}

function rangeShortcuts(today: string): { label: string; from: string; to: string }[] {
  const lastMonthStart = startOfMonth(today, -1);
  return [
    // Left to right like the calendar itself: past → present, then the wider span.
    { label: "Mês passado", from: lastMonthStart, to: addDays(startOfMonth(today), -1) },
    { label: "Este mês", from: startOfMonth(today), to: today },
    { label: "Este ano", from: `${today.slice(0, 4)}-01-01`, to: today },
  ];
}

/** Trigger showing the applied range; the popover edits a draft until "Aplicar". */
function CustomRange({
  from,
  to,
  defaultOpen,
  onApply,
  onOpenChange,
}: {
  from: string;
  to: string;
  defaultOpen: boolean;
  onApply: (from: string, to: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [draft, setDraft] = useState<DateRange>({ from, to });
  const today = brazilToday();

  function changeOpen(next: boolean) {
    if (next) {
      setDraft({ from, to });
    }
    setOpen(next);
    onOpenChange(next);
  }

  function apply() {
    if (draft.to === null) {
      return;
    }
    changeOpen(false);
    onApply(draft.from, draft.to);
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <RangeTrigger from={from} to={to} />
      </PopoverTrigger>
      <PopoverContent
        aria-label="Escolher período"
        collisionPadding={16}
        onOpenAutoFocus={focusSelectedDay}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            // Stops the focused day from also being "clicked" by the same Enter.
            event.preventDefault();
            apply();
          }
        }}
      >
        <RangeShortcuts today={today} draft={draft} onPick={setDraft} />
        <RangeCalendar
          value={draft}
          onChange={setDraft}
          max={today}
          maxDays={MAX_CUSTOM_DAYS}
          today={today}
        />
        <RangeFooter draft={draft} onCancel={() => changeOpen(false)} onApply={apply} />
      </PopoverContent>
    </Popover>
  );
}

/** Keyboard users land on the selected day, ready to use the arrows. */
function focusSelectedDay(event: Event) {
  if (!(event.currentTarget instanceof HTMLElement)) {
    return;
  }
  const day = event.currentTarget.querySelector<HTMLElement>('[role="grid"] button[tabindex="0"]');
  if (day) {
    event.preventDefault();
    day.focus();
  }
}

/** Radix passes the trigger props and ref through `asChild`, so they are forwarded here. */
function RangeTrigger({
  from,
  to,
  ...props
}: { from: string; to: string } & ComponentProps<"button">) {
  return (
    <button
      type="button"
      aria-label={`Período personalizado: ${formatRange(from, to)}. Alterar datas`}
      className="flex h-10 w-full items-center gap-2.5 rounded-xl border border-field-border bg-field pr-3 pl-3.5 text-sm tabular-nums transition-[border-color,box-shadow,background-color,transform] duration-100 outline-none select-none hover:bg-[color-mix(in_oklch,var(--field),var(--foreground)_3%)] focus-visible:border-brand-strong focus-visible:ring-4 focus-visible:ring-brand/20 active:scale-[0.98] aria-expanded:border-brand-strong motion-reduce:active:scale-100 sm:w-auto sm:self-start"
      {...props}
    >
      <CalendarBlankIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="truncate">{formatRange(from, to)}</span>
      <CaretDownIcon className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

function RangeShortcuts({
  today,
  draft,
  onPick,
}: {
  today: string;
  draft: DateRange;
  onPick: (range: DateRange) => void;
}) {
  return (
    <div className="mb-3 flex gap-1.5">
      {rangeShortcuts(today).map((shortcut) => {
        const active = draft.from === shortcut.from && draft.to === shortcut.to;
        return (
          <button
            key={shortcut.label}
            type="button"
            aria-pressed={active}
            onClick={() => onPick({ from: shortcut.from, to: shortcut.to })}
            className="h-7 rounded-full bg-muted px-3 text-xs font-medium text-muted-foreground transition-[background-color,color,transform] duration-100 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand active:scale-95 aria-pressed:bg-brand/15 aria-pressed:text-foreground motion-reduce:active:scale-100"
          >
            {shortcut.label}
          </button>
        );
      })}
    </div>
  );
}

/** Fixed width and two fixed rows: the popover never resizes as the summary changes. */
function RangeFooter({
  draft,
  onCancel,
  onApply,
}: {
  draft: DateRange;
  onCancel: () => void;
  onApply: () => void;
}) {
  const complete = draft.to !== null;
  const days = complete ? daysBetween(draft.from, draft.to ?? draft.from) + 1 : 0;
  return (
    <div className="mt-3 w-[17.5rem] border-t border-field-border pt-3">
      <p
        aria-live="polite"
        className="flex h-5 items-baseline justify-between gap-3 px-1 text-sm tabular-nums"
      >
        {complete ? (
          <>
            <span className="truncate font-medium">
              {formatRange(draft.from, draft.to ?? draft.from)}
            </span>
            <span className="shrink-0 text-muted-foreground">
              {days === 1 ? "1 dia" : `${days} dias`}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">Escolha o último dia</span>
        )}
      </p>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button size="sm" disabled={!complete} onClick={onApply}>
          Aplicar
        </Button>
      </div>
    </div>
  );
}
