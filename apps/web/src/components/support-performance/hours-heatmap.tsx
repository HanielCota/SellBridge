import { supportHourColumns, type HeatCell } from "@sellbridge/shared/support-performance";

/*
 * When tickets arrive, by weekday and hour on the Brasília clock, inside the support team's
 * hours plus one column for everything outside them. The coordination plans shifts with it.
 */

const WEEKDAYS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"] as const;
const WEEKDAY_NAMES = [
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
  "domingo",
] as const;

function cellKey(cell: Pick<HeatCell, "weekday" | "hour">): string {
  return `${cell.weekday}|${cell.hour}`;
}

function hourLabel(hour: number | "outside"): string {
  return hour === "outside" ? "Fora" : `${hour}h`;
}

/** The busiest cell in words, or null when nothing arrived. */
export function peakText(cells: readonly HeatCell[]): string | null {
  const peak = cells.toSorted((first, second) => second.opened - first.opened).at(0);
  if (peak === undefined || peak.opened === 0) {
    return null;
  }
  const day = WEEKDAY_NAMES[peak.weekday] ?? "";
  if (peak.hour === "outside") {
    return `${day}, fora do horário`;
  }
  return `${day}, ${peak.hour}h às ${peak.hour + 1}h`;
}

type Column = number | "outside";

function HeatRow({
  weekday,
  columns,
  byKey,
  top,
}: {
  weekday: number;
  columns: readonly Column[];
  byKey: ReadonlyMap<string, number>;
  top: number;
}) {
  return (
    <tr>
      <th scope="row" className="pr-1 text-left font-normal text-muted-foreground">
        {WEEKDAYS[weekday]}
      </th>
      {columns.map((hour) => {
        const opened = byKey.get(cellKey({ weekday, hour })) ?? 0;
        const strength = Math.round((opened / top) * 100);
        return (
          <td
            key={hour}
            title={`${WEEKDAY_NAMES[weekday]}, ${hourLabel(hour)}: ${opened} ${opened === 1 ? "chamado" : "chamados"}`}
            className="h-8 rounded-md"
            style={{
              backgroundColor: `color-mix(in oklch, var(--chart-brand) ${strength}%, var(--muted))`,
            }}
          >
            <span className="sr-only">{opened}</span>
          </td>
        );
      })}
    </tr>
  );
}

function HeatTable({ cells }: { cells: readonly HeatCell[] }) {
  const columns: Column[] = [...supportHourColumns(), "outside"];
  const byKey = new Map(cells.map((cell) => [cellKey(cell), cell.opened]));
  const top = Math.max(1, ...cells.map((cell) => cell.opened));
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[30rem] border-separate border-spacing-1 text-xs tabular-nums">
        <caption className="sr-only">Chamados que chegaram por dia da semana e hora</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Dia</span>
            </th>
            {columns.map((hour) => (
              <th key={hour} scope="col" className="font-normal text-muted-foreground">
                {hourLabel(hour)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {WEEKDAYS.map((day, weekday) => (
            <HeatRow key={day} weekday={weekday} columns={columns} byKey={byKey} top={top} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HoursHeatmap({ cells }: { cells: readonly HeatCell[] }) {
  const peak = peakText(cells);
  return (
    <div className="flex h-full flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {peak === null ? (
          "Nenhum chamado no período."
        ) : (
          <>
            Pico: <span className="font-medium text-foreground">{peak}</span>
          </>
        )}
      </p>
      <HeatTable cells={cells} />
      <p className="mt-auto flex items-center gap-2 text-xs text-muted-foreground">
        Menos
        <span
          aria-hidden="true"
          className="h-2 w-24 rounded-full bg-linear-to-r from-muted to-chart-brand"
        />
        Mais
      </p>
    </div>
  );
}
