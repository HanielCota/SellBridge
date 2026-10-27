import { CalendarBlankIcon, CaretLeftIcon, CaretRightIcon, XIcon } from "@phosphor-icons/react";
import { MAX_CUSTOM_DAYS } from "@sellbridge/shared/period-range";
import {
  brazilDateOf,
  monthLabel,
  reportPeriodLabel,
  shiftMonth,
  type ReportPeriod,
} from "@sellbridge/shared/report-period";
import type { ReportPeriodSearch } from "@sellbridge/shared/schemas";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  addDays,
  daysBetween,
  RangeCalendar,
  startOfMonth,
  type DateRange,
} from "@/components/ui/range-calendar";

/** Read at the time of the click or render, in Brazil time; a function keeps the render pure. */
function todayInBrazil(): string {
  return brazilDateOf(new Date());
}

interface PeriodControlsProps {
  period: ReportPeriod;
  onChange: (search: ReportPeriodSearch) => void;
}

/** ‹ Setembro de 2026 ›, with "mês fechado" or "parcial, até hoje" under it. */
function MonthStepper({ period, onChange }: PeriodControlsProps) {
  const month = period.month ?? period.toDate.slice(0, 7);
  const isCurrent = month >= todayInBrazil().slice(0, 7);
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon-lg"
        aria-label={`Mês anterior: ${monthLabel(shiftMonth(month, -1))}`}
        onClick={() => onChange({ mes: shiftMonth(month, -1) })}
      >
        <CaretLeftIcon aria-hidden="true" />
      </Button>
      <div className="min-w-40 text-center" aria-live="polite">
        <p className="text-subhead font-semibold tabular-nums">{monthLabel(month)}</p>
        <p className="text-xs text-muted-foreground">
          {period.status === "closed" ? "mês fechado" : "parcial, até hoje"}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon-lg"
        disabled={isCurrent}
        aria-label={
          isCurrent ? "Este é o mês atual" : `Próximo mês: ${monthLabel(shiftMonth(month, 1))}`
        }
        onClick={() => onChange({ mes: shiftMonth(month, 1) })}
      >
        <CaretRightIcon aria-hidden="true" />
      </Button>
    </div>
  );
}

/** A picked range shows as a pill; the X goes back to the month mode. */
function RangePill({ period, onChange }: PeriodControlsProps) {
  return (
    <span className="inline-flex h-11 items-center gap-1 rounded-full bg-muted pr-1 pl-4 text-sm font-medium tabular-nums">
      {reportPeriodLabel(period)}
      <span className="font-normal text-muted-foreground">
        · {period.days === 1 ? "1 dia" : `${period.days} dias`}
      </span>
      <button
        type="button"
        aria-label="Voltar para o mês"
        onClick={() => onChange({ mes: period.fromDate.slice(0, 7) })}
        className="ml-1 flex size-9 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-background hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <XIcon className="size-4" aria-hidden="true" />
      </button>
    </span>
  );
}

function shortcuts(today: string): { label: string; from: string; to: string }[] {
  return [
    { label: "Este mês", from: startOfMonth(today), to: today },
    { label: "Mês passado", from: startOfMonth(today, -1), to: addDays(startOfMonth(today), -1) },
    { label: "Últimos 7 dias", from: addDays(today, -6), to: today },
    { label: "Últimos 30 dias", from: addDays(today, -29), to: today },
  ];
}

const dayFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC",
});

function shortDate(iso: string): string {
  return dayFormatter.format(new Date(`${iso}T12:00:00.000Z`));
}

function DraftSummary({ draft }: { draft: DateRange }) {
  if (draft.to === null) {
    return <span className="text-muted-foreground">Toque no último dia</span>;
  }
  const days = daysBetween(draft.from, draft.to) + 1;
  return (
    <>
      <span className="font-medium">
        {shortDate(draft.from)} a {shortDate(draft.to)}
      </span>
      <span className="text-muted-foreground">· {days === 1 ? "1 dia" : `${days} dias`}</span>
    </>
  );
}

/** "Escolher período": shortcuts, a range calendar and Cancelar / Ver período. */
function PeriodPicker({ period, onChange }: PeriodControlsProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>({ from: period.fromDate, to: period.toDate });
  const today = todayInBrazil();

  function changeOpen(next: boolean) {
    if (next) {
      setDraft({ from: period.fromDate, to: period.toDate });
    }
    setOpen(next);
  }

  function apply() {
    if (draft.to === null) {
      return;
    }
    setOpen(false);
    onChange({ de: draft.from, ate: draft.to });
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="lg">
          <CalendarBlankIcon aria-hidden="true" />
          Escolher período
        </Button>
      </PopoverTrigger>
      <PopoverContent aria-label="Escolher período" align="end" className="w-auto">
        <Shortcuts today={today} draft={draft} onPick={setDraft} />
        <RangeCalendar
          value={draft}
          onChange={setDraft}
          max={today}
          maxDays={MAX_CUSTOM_DAYS}
          today={today}
        />
        <PickerFooter draft={draft} onCancel={() => setOpen(false)} onApply={apply} />
      </PopoverContent>
    </Popover>
  );
}

/** Este mês, Mês passado, Últimos 7 e 30 dias. */
function Shortcuts({
  today,
  draft,
  onPick,
}: {
  today: string;
  draft: DateRange;
  onPick: (range: DateRange) => void;
}) {
  return (
    <div className="mb-3 flex max-w-[17.5rem] flex-wrap gap-1.5">
      {shortcuts(today).map((shortcut) => (
        <button
          key={shortcut.label}
          type="button"
          aria-pressed={draft.from === shortcut.from && draft.to === shortcut.to}
          onClick={() => onPick({ from: shortcut.from, to: shortcut.to })}
          className="h-8 rounded-full bg-muted px-3 text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand aria-pressed:bg-brand/15 aria-pressed:text-foreground"
        >
          {shortcut.label}
        </button>
      ))}
    </div>
  );
}

/** "dd/mm a dd/mm · N dias", then Cancelar and Ver período. */
function PickerFooter({
  draft,
  onCancel,
  onApply,
}: {
  draft: DateRange;
  onCancel: () => void;
  onApply: () => void;
}) {
  return (
    <div className="mt-3 w-[17.5rem] border-t border-field-border pt-3">
      <p aria-live="polite" className="flex h-5 gap-1.5 px-1 text-sm tabular-nums">
        <DraftSummary draft={draft} />
      </p>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button disabled={draft.to === null} onClick={onApply}>
          Ver período
        </Button>
      </div>
    </div>
  );
}

/** The month stepper (or the picked range) and the "Escolher período" button. */
export function PeriodControls(props: PeriodControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {props.period.kind === "month" ? <MonthStepper {...props} /> : <RangePill {...props} />}
      <PeriodPicker {...props} />
    </div>
  );
}
