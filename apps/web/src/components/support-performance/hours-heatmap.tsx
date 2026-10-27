import {
  supportHourColumns,
  type HeatCell,
  type SupportPerformanceReport,
} from "@sellbridge/shared/support-performance";
import { useRef, useState } from "react";
import { FilterTabs } from "@/components/data/filter-tabs";
import { formatMinutes } from "@/features/support/performance-format";
import {
  cellTip,
  cellTitle,
  formatPerWeek,
  hourLabel,
  peakText,
  peakWindow,
  perWeek,
  perWeekUnit,
  slowestCell,
  SUPPORT_HOURS_TEXT,
  weeksOf,
  WEEKDAY_SHORT,
  type HoursMode,
} from "@/features/support/performance-hours";
import { cn } from "@/lib/utils";
import { HourCellTip, HoursInsights, PickedCellPanel } from "./hours-panels";

/*
 * When tickets arrive (or how long they wait) by weekday and hour on the Brasília clock, inside
 * the support hours plus one column for the hours the team is closed. Hover a cell for its
 * numbers; click it to see its latest tickets.
 */

const MODE_TABS = [
  { value: "arrive", label: "Quando chegam" },
  { value: "wait", label: "Quanto esperam" },
] as const satisfies readonly { value: HoursMode; label: string }[];

type Column = number | "outside";
type CellRef = { weekday: number; hour: Column };
/** Where the hovered cell sits inside the map, so its card can open next to it. */
export interface CellAnchor {
  centerX: number;
  top: number;
  bottom: number;
  width: number;
}

function sameCell(cell: CellRef | null, other: CellRef): boolean {
  return cell !== null && cell.weekday === other.weekday && cell.hour === other.hour;
}

function cellValue(cell: HeatCell, mode: HoursMode, weeks: number): number | null {
  return mode === "arrive" ? perWeek(cell, weeks) : cell.firstResponseMinutes;
}

function cellText(value: number | null, mode: HoursMode): string {
  if (value === null) {
    return "—";
  }
  return mode === "arrive" ? formatPerWeek(value) : formatMinutes(value);
}

function Header({ report, mode }: { report: SupportPerformanceReport; mode: HoursMode }) {
  const peak = peakWindow(report.heatmap);
  const slowest = slowestCell(report.heatmap);
  const weeks = weeksOf(report);
  const title =
    mode === "arrive" ? "Quando os chamados chegam" : "Quanto o cliente espera em cada horário";
  let headline = "Nenhum chamado no período";
  let note = "";
  if (mode === "arrive" && peak !== null) {
    headline = `Pico: ${peakText(peak)}`;
    note = `${formatPerWeek(peak.opened / weeks)} chamados ${perWeekUnit(report)} nessas 2 horas`;
  }
  if (mode === "wait" && slowest !== null && slowest.hour !== "outside") {
    headline = `Mais lento: ${WEEKDAY_SHORT[slowest.weekday] ?? ""}, ${slowest.hour}h`;
    note = `1ª resposta em ${formatMinutes(slowest.firstResponseMinutes)} · mediana do período`;
  }
  return (
    <div className="space-y-1.5">
      <h2 id="support-chart-title" className="text-subhead font-medium text-muted-foreground">
        {title}
      </h2>
      <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="text-3xl font-semibold tracking-tight">{headline}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{note}</span>
      </p>
    </div>
  );
}

interface GridProps {
  report: SupportPerformanceReport;
  mode: HoursMode;
  hovered: CellRef | null;
  picked: CellRef | null;
  onHover: (cell: CellRef | null, element?: HTMLElement) => void;
  onPick: (cell: CellRef) => void;
}

function HeatButton({
  cell,
  value,
  top,
  mode,
  props,
}: {
  cell: HeatCell;
  value: number | null;
  top: number;
  mode: HoursMode;
  props: GridProps;
}) {
  const outside = cell.hour === "outside";
  const strength = value === null ? 0 : Math.min(100, Math.round((value / top) * 100));
  const lit = sameCell(props.hovered, cell) || sameCell(props.picked, cell);
  const dim =
    props.hovered !== null &&
    props.hovered.weekday !== cell.weekday &&
    props.hovered.hour !== cell.hour;
  const tone = mode === "arrive" ? "var(--chart-brand)" : "var(--destructive)";
  return (
    <button
      type="button"
      aria-label={`${cellTitle(cell)}: ${cellText(value, mode)}`}
      aria-pressed={sameCell(props.picked, cell)}
      onClick={() => props.onPick(cell)}
      onMouseEnter={(event) => props.onHover(cell, event.currentTarget)}
      onFocus={(event) => props.onHover(cell, event.currentTarget)}
      onMouseLeave={() => props.onHover(null)}
      onBlur={() => props.onHover(null)}
      className={cn(
        "grid h-8 w-full place-items-center rounded-lg text-caption font-medium tabular-nums outline-none transition-opacity duration-150 focus-visible:ring-3 focus-visible:ring-ring/50",
        strength >= 60 && !outside ? "text-card" : "text-muted-foreground",
        lit && "ring-2 ring-foreground",
        dim && "opacity-40",
      )}
      style={{
        background: outside
          ? "repeating-linear-gradient(135deg, var(--muted) 0 4px, transparent 4px 8px)"
          : `color-mix(in oklch, ${tone} ${strength}%, var(--muted))`,
      }}
    >
      {cellText(value, mode)}
    </button>
  );
}

function HeatHead({ columns, hovered }: { columns: Column[]; hovered: CellRef | null }) {
  return (
    <thead>
      <tr>
        <th scope="col" className="w-10">
          <span className="sr-only">Dia</span>
        </th>
        {columns.map((hour) => (
          <th
            key={hour}
            scope="col"
            className={cn(
              "font-normal",
              hovered?.hour === hour ? "font-bold text-foreground" : "text-muted-foreground",
            )}
          >
            {hourLabel(hour)}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function HeatGrid(props: GridProps) {
  const { report, mode, hovered } = props;
  const columns: Column[] = [...supportHourColumns(), "outside"];
  const weeks = weeksOf(report);
  const byKey = new Map(report.heatmap.map((cell) => [`${cell.weekday}|${cell.hour}`, cell]));
  const top = Math.max(
    1,
    ...report.heatmap
      .filter((cell) => cell.hour !== "outside")
      .map((cell) => cellValue(cell, mode, weeks) ?? 0),
  );
  return (
    <table className="w-full min-w-[34rem] table-fixed border-separate border-spacing-1 text-xs">
      <caption className="sr-only">Chamados por dia da semana e hora</caption>
      <HeatHead columns={columns} hovered={hovered} />
      <tbody>
        {WEEKDAY_SHORT.map((day, weekday) => (
          <tr key={day}>
            <th
              scope="row"
              className={cn(
                "pr-1 text-left",
                hovered?.weekday === weekday
                  ? "font-bold text-foreground"
                  : "font-normal text-muted-foreground",
              )}
            >
              {day}
            </th>
            {columns.map((hour) => {
              const cell = byKey.get(`${weekday}|${hour}`);
              return (
                <td key={hour}>
                  {cell === undefined ? null : (
                    <HeatButton
                      cell={cell}
                      value={cellValue(cell, mode, weeks)}
                      top={top}
                      mode={mode}
                      props={props}
                    />
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MapLegend({ mode }: { mode: HoursMode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
      <span className="flex items-center gap-2">
        {mode === "arrive" ? "Menos" : "Rápido"}
        <span
          aria-hidden="true"
          className={cn(
            "h-2 w-24 rounded-full bg-linear-to-r from-muted",
            mode === "arrive" ? "to-chart-brand" : "to-destructive",
          )}
        />
        {mode === "arrive" ? "Mais" : "Demorado"}
      </span>
      <span>{SUPPORT_HOURS_TEXT}</span>
    </div>
  );
}

export function HoursHeatmap({ report }: { report: SupportPerformanceReport }) {
  const [mode, setMode] = useState<HoursMode>("arrive");
  const [hovered, setHovered] = useState<CellRef | null>(null);
  const [anchor, setAnchor] = useState<CellAnchor | null>(null);
  const [picked, setPicked] = useState<CellRef | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  function hover(cell: CellRef | null, element?: HTMLElement) {
    setHovered(cell);
    const map = mapRef.current;
    if (cell === null || element === undefined || map === null) {
      setAnchor(null);
      return;
    }
    const box = map.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    setAnchor({
      centerX: rect.left - box.left + rect.width / 2,
      top: rect.top - box.top,
      bottom: rect.bottom - box.top,
      width: box.width,
    });
  }
  const hoveredCell = report.heatmap.find((cell) => sameCell(hovered, cell));
  const pickedCell = report.heatmap.find((cell) => sameCell(picked, cell));
  return (
    <div className="flex flex-col gap-4">
      <Header report={report} mode={mode} />
      <FilterTabs legend="O que o mapa mostra" tabs={MODE_TABS} value={mode} onChange={setMode} />
      {/* Scrolls sideways only on narrow screens; on wide ones the hover card may rise above it. */}
      <div ref={mapRef} className="relative max-md:overflow-x-auto">
        <HeatGrid
          report={report}
          mode={mode}
          hovered={hovered}
          picked={picked}
          onHover={hover}
          onPick={(cell) => {
            setPicked(cell);
            hover(null);
          }}
        />
        {hoveredCell === undefined || anchor === null ? null : (
          <HourCellTip anchor={anchor} tip={cellTip(report, hoveredCell)} />
        )}
      </div>
      {pickedCell === undefined ? null : (
        <PickedCellPanel report={report} cell={pickedCell} onClose={() => setPicked(null)} />
      )}
      <MapLegend mode={mode} />
      <HoursInsights report={report} />
    </div>
  );
}
