import type { OrderFinancialRow } from "@sellbridge/database/repositories";
import { formatCents } from "@sellbridge/shared/money";
import { REPORT_TIME_ZONE } from "@sellbridge/shared/period-range";
import { ProductVisual } from "@/components/catalog/product-visual";
import { SmartDate } from "@/components/data/smart-date";
import { OrderStatusBadge } from "@/components/reports/order-status-badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CaretDownIcon } from "@phosphor-icons/react";
import { useId, useState } from "react";
import {
  type DaySplit,
  daySplit,
  foldRows,
  formatDayHeading,
  groupOrdersByDay,
} from "@/features/reports/financial-rows";
import { displayBuyerName } from "@/features/orders/buyer-name";
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
          {displayBuyerName(row.buyerName)}
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
      <ProfitAmount cents={row.profitCents} plus className="block text-sm" />
      <span className="block text-xs text-muted-foreground tabular-nums">
        {isVoidOrder(row) ? "fora da receita" : `de ${formatCents(row.revenueCents)}`}
      </span>
    </span>
  );
}

/** The hairline starts where the text does, like a grouped list, so the thumbnails stay a column. */
const ROW_DIVIDER =
  "relative not-first:before:absolute not-first:before:top-0 not-first:before:right-4 not-first:before:left-[4.25rem] not-first:before:h-px not-first:before:bg-border sm:not-first:before:right-5 sm:not-first:before:left-[4.75rem]";

/** Highlights on press, not on release, so the row answers the instant it's touched. */
const ROW_BUTTON =
  "flex w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-foreground/[0.03] focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset active:bg-foreground/[0.06] sm:gap-3.5 sm:px-5";

function RowThumb({ row }: { row: OrderFinancialRow }) {
  return (
    <span className="size-11 shrink-0 overflow-hidden rounded-xl">
      <ProductVisual
        imageUrl={row.product?.imageUrl ?? null}
        title={row.product?.title ?? row.items}
        categoryName={row.product?.categoryName ?? null}
        soldOut={isVoidOrder(row)}
        compact
        className="size-full"
      />
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
  return (
    <li className={ROW_DIVIDER}>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(ROW_BUTTON, "data-[state=open]:bg-foreground/[0.04]")}
          >
            <RowThumb row={row} />
            <RowSummary row={row} byDay={byDay} showStore={showStore} />
            <RowAmount row={row} />
          </button>
        </PopoverTrigger>
        <OrderDetail row={row} />
      </Popover>
    </li>
  );
}

/**
 * What makes two orders of a day the same line: same items from the same store, same amounts,
 * and a status that reads the same (the quiet ones count as one).
 */
function sameSaleKey(row: OrderFinancialRow): string {
  const status = NOTABLE_STATUSES.has(row.status) ? row.status : "counted";
  return [row.items, row.storeName, status, row.revenueCents, row.profitCents].join("|");
}

/** One order inside an opened group: its time and number, with its own detail on click. */
function GroupedOrder({ row }: { row: OrderFinancialRow }) {
  return (
    <li>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-xs outline-none hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-ring/50 active:bg-foreground/[0.07] data-[state=open]:bg-foreground/[0.05]"
          >
            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <time
                dateTime={row.orderedAt.toISOString()}
                className="shrink-0 text-foreground tabular-nums"
              >
                {clockTime.format(row.orderedAt)}
              </time>
              <span aria-hidden="true">·</span>
              <span className="truncate">{row.externalOrderId}</span>
            </span>
            <ProfitAmount cents={row.profitCents} plus />
          </button>
        </PopoverTrigger>
        <OrderDetail row={row} />
      </Popover>
    </li>
  );
}

/** "08:30 – 22:21 · R$ 49,07 cada", plus the store and a status only when they matter. */
function GroupSummaryLine({
  rows,
  first,
  showStore,
}: {
  rows: readonly OrderFinancialRow[];
  first: OrderFinancialRow;
  showStore: boolean;
}) {
  const times = rows.map((row) => row.orderedAt.getTime());
  return (
    <span className="flex min-w-0 items-center gap-1.5 overflow-hidden text-xs text-muted-foreground">
      <span className="shrink-0 tabular-nums">
        {clockTime.format(new Date(Math.min(...times)))} –{" "}
        {clockTime.format(new Date(Math.max(...times)))}
      </span>
      {/* On a phone the line keeps only the times; the per-sale amount joins from sm up. */}
      {isVoidOrder(first) ? null : (
        <span className="hidden min-w-0 items-center gap-1.5 sm:flex">
          <span aria-hidden="true">·</span>
          <span className="truncate tabular-nums">{signedCents(first.profitCents)} cada</span>
        </span>
      )}
      {showStore ? (
        <span className="hidden min-w-0 items-center gap-1.5 sm:flex">
          <span aria-hidden="true">·</span>
          <span className="truncate">{displayStoreName(first.storeName)}</span>
        </span>
      ) : null}
      {NOTABLE_STATUSES.has(first.status) ? (
        <span className="ml-1 shrink-0 text-foreground">
          <OrderStatusBadge status={first.status} />
        </span>
      ) : null}
    </span>
  );
}

/** The group's orders, unfolding in place: height grows from 0fr to 1fr under the line. */
function GroupOrders({
  id,
  open,
  rows,
  label,
}: {
  id: string;
  open: boolean;
  rows: readonly OrderFinancialRow[];
  label: string;
}) {
  return (
    // Closed, it is out of the tab order and hidden from assistive tech, not just squashed.
    <div
      id={id}
      inert={!open}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-opacity",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <ul
          aria-label={`${rows.length} pedidos de ${label}`}
          className="grid gap-0.5 pr-4 pb-3 pl-[3.75rem] sm:pr-5 sm:pl-[4.25rem]"
        >
          {rows.map((row) => (
            <GroupedOrder key={row.id} row={row} />
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Identical sales of a day as one line: how many, from when to when, what each made and the
 * total. It opens in place into the orders themselves, each still with its own detail.
 */
function GroupRow({ rows, showStore }: { rows: readonly OrderFinancialRow[]; showStore: boolean }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const [first] = rows;
  if (!first) {
    return null;
  }
  const profit = rows.reduce((sum, row) => sum + row.profitCents, 0);
  const revenue = rows.reduce((sum, row) => sum + row.revenueCents, 0);
  const isVoid = isVoidOrder(first);
  return (
    <li className={ROW_DIVIDER}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className={cn(ROW_BUTTON, open && "bg-foreground/[0.02]")}
      >
        <RowThumb row={first} />
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className={cn("truncate text-sm font-medium", isVoid && "text-muted-foreground")}>
              {itemsLabel(first.items)}
            </span>
            <span className="shrink-0 rounded-full bg-brand/15 px-2 py-px text-xs font-semibold text-brand-text tabular-nums">
              <span className="sr-only">vendido </span>×{rows.length}
            </span>
          </span>
          <GroupSummaryLine rows={rows} first={first} showStore={showStore} />
        </span>
        <span className="shrink-0 space-y-0.5 text-right">
          <ProfitAmount cents={profit} plus className="block text-sm" />
          <span className="block text-xs text-muted-foreground tabular-nums">
            {isVoid ? "fora da receita" : `de ${formatCents(revenue)}`}
          </span>
        </span>
        <CaretDownIcon
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>
      <GroupOrders id={listId} open={open} rows={rows} label={itemsLabel(first.items)} />
    </li>
  );
}

function StatementCard({
  rows,
  byDay,
  showStore,
  foldSales,
}: {
  rows: readonly OrderFinancialRow[];
  byDay: boolean;
  showStore: boolean;
  foldSales: boolean;
}) {
  const groups = foldSales
    ? foldRows(rows, sameSaleKey)
    : rows.map((row) => ({ key: row.id, rows: [row] }));
  return (
    <ul className="surface-card overflow-hidden rounded-3xl bg-card py-1.5">
      {groups.map((group) => {
        const [only] = group.rows;
        if (only && group.rows.length === 1) {
          return <StatementRow key={only.id} row={only} byDay={byDay} showStore={showStore} />;
        }
        return <GroupRow key={group.key} rows={group.rows} showStore={showStore} />;
      })}
    </ul>
  );
}

/**
 * "3 vendas" counts only orders that still count as a sale; when the day also lists cancelled or
 * returned orders, it says "válidas" so the number does not read as a count of the rows below.
 */
const VOID_ROWS_HINT =
  "Pedidos aguardando pagamento, cancelados ou devolvidos não contam como venda.";

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
  continued,
}: {
  dayKey: string;
  total: DayTotal | undefined;
  hasVoidRows: boolean;
  /** The day began on the previous page; its totals still cover the whole day. */
  continued: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-1 pb-2.5">
      {/* "Hoje" depends on the clock, so server and browser may disagree right at midnight. */}
      <h3 className="text-sm font-medium" suppressHydrationWarning>
        {formatDayHeading(dayKey)}
        {continued ? (
          <span className="font-normal text-muted-foreground"> · continuação</span>
        ) : null}
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

/** One day of the statement: its heading, its orders, and a note when the page cut it. */
function StatementDay({
  dayKey,
  rows,
  total,
  split,
  showHeading,
  showStore,
  foldSales,
}: {
  dayKey: string;
  rows: readonly OrderFinancialRow[];
  total: DayTotal | undefined;
  split: DaySplit;
  showHeading: boolean;
  showStore: boolean;
  foldSales: boolean;
}) {
  return (
    <div>
      {showHeading ? (
        <DayHeading
          dayKey={dayKey}
          total={total}
          hasVoidRows={rows.some(isVoidOrder)}
          continued={split.fromPrevious}
        />
      ) : null}
      <StatementCard rows={rows} byDay showStore={showStore} foldSales={foldSales} />
      {split.toNext ? (
        <p className="px-1 pt-2.5 text-xs text-muted-foreground">
          Mais vendas deste dia na próxima página.
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
  showDayHeadings = true,
  foldSales = true,
  page = 1,
  totalPages = 1,
}: {
  rows: readonly OrderFinancialRow[];
  /** Whole-day totals; null when a filter narrows the list and they would not match it. */
  dayTotals: ReadonlyMap<string, DayTotal> | null;
  byDay: boolean;
  showStore: boolean;
  /** Off when the statement already shows a single picked day in its title. */
  showDayHeadings?: boolean;
  /**
   * Identical sales of a day fold into one "×N" line. Off while searching or filtering: then the
   * reseller is after specific orders and each one gets its own row.
   */
  foldSales?: boolean;
  /** Where this page sits, so a day cut by the page break says so on both sides. */
  page?: number;
  totalPages?: number;
}) {
  if (!byDay) {
    return (
      <section aria-label="Financeiro por pedido">
        <StatementCard rows={rows} byDay={false} showStore={showStore} foldSales={false} />
      </section>
    );
  }
  const days = groupOrdersByDay(rows);
  return (
    <section aria-label="Financeiro por pedido" className="space-y-6">
      {days.map((day, index) => (
        <StatementDay
          key={day.key}
          dayKey={day.key}
          rows={day.rows}
          total={dayTotals?.get(day.key)}
          split={daySplit({
            salesOnPage: day.rows.filter((row) => !isVoidOrder(row)).length,
            salesInDay: dayTotals?.get(day.key)?.orders ?? 0,
            isFirstDay: index === 0,
            isLastDay: index === days.length - 1,
            page,
            totalPages,
          })}
          showHeading={showDayHeadings}
          showStore={showStore}
          foldSales={foldSales}
        />
      ))}
    </section>
  );
}
