import type { OrderFinancialRow } from "@sellbridge/database/repositories";
import { formatCents } from "@sellbridge/shared/money";
import { REPORT_TIME_ZONE } from "@sellbridge/shared/period-range";
import { ProductVisual } from "@/components/catalog/product-visual";
import { SmartDate } from "@/components/data/smart-date";
import { OrderStatusBadge } from "@/components/reports/order-status-badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDayHeading, groupOrdersByDay } from "@/features/reports/financial-rows";
import { displayStoreName } from "@/features/stores/store-name";
import { formatAbsoluteTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";
import {
  isVoidOrder,
  marginLabel,
  OrderBreakdown,
  OrderSplitBar,
  ProfitAmount,
  signedCents,
} from "./order-parts";

export interface DayTotal {
  date: string;
  orders: number;
  profitCents: number;
}

/** Statuses that change what an order is worth; the usual path (paid, shipped, delivered) stays quiet. */
const NOTABLE_STATUSES = new Set(["pending", "cancelled", "returned"]);

const clockTime = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: REPORT_TIME_ZONE,
});

/** "Moletom - Rosa (x1)" reads as "Moletom - Rosa": one unit is the norm, so only more is said. */
function itemsLabel(items: string): string {
  return items.replaceAll(" (x1)", "");
}

/** The order's math, opened from its row, with what the row leaves out (id, buyer, margin). */
function OrderDetail({ row }: { row: OrderFinancialRow }) {
  const margin = marginLabel(row);
  return (
    <PopoverContent
      aria-label={`Cálculo do pedido ${row.externalOrderId}`}
      side="bottom"
      align="end"
      // The sticky top bar (88px) is off limits, so a flipped detail never hides beneath it.
      collisionPadding={{ top: 100, right: 16, bottom: 16, left: 16 }}
      className="w-80 max-w-[calc(100vw-2rem)] space-y-4 p-4"
    >
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-sm font-medium">{row.externalOrderId}</p>
          <OrderStatusBadge status={row.status} />
        </div>
        <p className="text-xs text-muted-foreground">{row.items}</p>
        <p className="text-xs text-muted-foreground">
          {formatAbsoluteTime(row.orderedAt)}
          {" · "}
          {row.buyerName ?? "Comprador não informado"}
          {margin ? ` · margem ${margin}` : null}
        </p>
      </div>
      <OrderSplitBar row={row} />
      <OrderBreakdown row={row} />
    </PopoverContent>
  );
}

/** When it happened: the clock time under a day heading, the full smart date in a flat list. */
function RowWhen({ date, byDay }: { date: Date; byDay: boolean }) {
  if (byDay) {
    return (
      <time dateTime={date.toISOString()} className="shrink-0 tabular-nums">
        {clockTime.format(date)}
      </time>
    );
  }
  return <SmartDate date={date} className="shrink-0" />;
}

/** What sold, when, where, and a badge only when the status changes the money. */
function RowSummary({
  row,
  byDay,
  showStore,
}: {
  row: OrderFinancialRow;
  byDay: boolean;
  showStore: boolean;
}) {
  return (
    <span className="min-w-0 flex-1 space-y-0.5">
      <span className="sr-only">Pedido {row.externalOrderId}: </span>
      <span
        className={cn(
          "block truncate text-sm font-medium",
          isVoidOrder(row) && "text-muted-foreground",
        )}
      >
        {itemsLabel(row.items)}
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <RowWhen date={row.orderedAt} byDay={byDay} />
        {showStore ? (
          <>
            <span aria-hidden="true">·</span>
            <span className="truncate">{displayStoreName(row.storeName)}</span>
          </>
        ) : null}
        {NOTABLE_STATUSES.has(row.status) ? (
          <span className="ml-1 shrink-0 text-foreground">
            <OrderStatusBadge status={row.status} />
          </span>
        ) : null}
      </span>
    </span>
  );
}

/** The profit on top, lined up with every other row's, and the sale it came from below. */
function RowAmount({ row }: { row: OrderFinancialRow }) {
  return (
    <span className="shrink-0 space-y-0.5 text-right">
      <ProfitAmount row={row} plus className="block text-sm" />
      <span className="block text-xs text-muted-foreground tabular-nums">
        {isVoidOrder(row) ? "fora da receita" : `de ${formatCents(row.revenueCents)}`}
      </span>
    </span>
  );
}

function StatementRow({
  row,
  byDay,
  showStore,
}: {
  row: OrderFinancialRow;
  byDay: boolean;
  showStore: boolean;
}) {
  const isVoid = isVoidOrder(row);
  return (
    // The hairline starts where the text does, like a grouped list, so the thumbnails stay a column.
    <li className="relative not-first:before:absolute not-first:before:top-0 not-first:before:right-4 not-first:before:left-[4.25rem] not-first:before:h-px not-first:before:bg-border sm:not-first:before:right-5 sm:not-first:before:left-[4.75rem]">
      <Popover>
        <PopoverTrigger asChild>
          {/* Highlights on press, not on release, so the row answers the instant it's touched. */}
          <button
            type="button"
            className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-foreground/[0.03] focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset active:bg-foreground/[0.06] data-[state=open]:bg-foreground/[0.04] sm:gap-3.5 sm:px-5"
          >
            <span className="size-11 shrink-0 overflow-hidden rounded-xl">
              <ProductVisual
                imageUrl={row.product?.imageUrl ?? null}
                title={row.product?.title ?? row.items}
                categoryName={row.product?.categoryName ?? null}
                soldOut={isVoid}
                compact
                className="size-full"
              />
            </span>
            <RowSummary row={row} byDay={byDay} showStore={showStore} />
            <RowAmount row={row} />
          </button>
        </PopoverTrigger>
        <OrderDetail row={row} />
      </Popover>
    </li>
  );
}

function StatementCard({
  rows,
  byDay,
  showStore,
}: {
  rows: readonly OrderFinancialRow[];
  byDay: boolean;
  showStore: boolean;
}) {
  return (
    <ul className="surface-card overflow-hidden rounded-3xl bg-card py-1.5">
      {rows.map((row) => (
        <StatementRow key={row.id} row={row} byDay={byDay} showStore={showStore} />
      ))}
    </ul>
  );
}

/**
 * "3 vendas" counts only orders that still count as a sale; when the day also lists cancelled or
 * returned orders, it says "válidas" so the number does not read as a count of the rows below.
 */
const VOID_ROWS_HINT = "Pedidos cancelados ou devolvidos não contam como venda.";

function salesLabel(sales: number, hasVoidRows: boolean): string {
  const noun = sales === 1 ? "venda" : "vendas";
  if (!hasVoidRows) {
    return `${sales} ${noun}`;
  }
  return `${sales} ${noun} ${sales === 1 ? "válida" : "válidas"}`;
}

function DayHeading({
  dayKey,
  total,
  hasVoidRows,
}: {
  dayKey: string;
  total: DayTotal | undefined;
  hasVoidRows: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-1 pb-2.5">
      {/* "Hoje" depends on the clock, so server and browser may disagree right at midnight. */}
      <h3 className="text-sm font-medium" suppressHydrationWarning>
        {formatDayHeading(dayKey)}
      </h3>
      {total && total.orders > 0 ? (
        <p
          className="text-xs text-muted-foreground tabular-nums"
          title={hasVoidRows ? VOID_ROWS_HINT : undefined}
        >
          {salesLabel(total.orders, hasVoidRows)}
          {" · "}
          <span
            className={cn(
              "font-medium",
              total.profitCents >= 0 ? "text-foreground" : "text-destructive",
            )}
          >
            {signedCents(total.profitCents, { plus: true })}
          </span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * Orders as a statement, like a bank's: grouped by day with what each day made, one quiet line
 * per order and its profit lined up on the right. Only a status that changes the money gets a
 * badge. Sorted by anything but the date, the days lose meaning and the list goes flat.
 */
export function OrderStatement({
  rows,
  dayTotals,
  byDay,
  showStore,
}: {
  rows: readonly OrderFinancialRow[];
  /** Whole-day totals; null when a filter narrows the list and they would not match it. */
  dayTotals: ReadonlyMap<string, DayTotal> | null;
  byDay: boolean;
  showStore: boolean;
}) {
  if (!byDay) {
    return (
      <section aria-label="Financeiro por pedido">
        <StatementCard rows={rows} byDay={false} showStore={showStore} />
      </section>
    );
  }
  return (
    <section aria-label="Financeiro por pedido" className="space-y-6">
      {groupOrdersByDay(rows).map((day) => (
        <div key={day.key}>
          <DayHeading
            dayKey={day.key}
            total={dayTotals?.get(day.key)}
            hasVoidRows={day.rows.some(isVoidOrder)}
          />
          <StatementCard rows={day.rows} byDay showStore={showStore} />
        </div>
      ))}
    </section>
  );
}
