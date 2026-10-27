import { type QueueDeadline, shortCountdownLabel } from "@sellbridge/shared/supplier-panel-orders";
import { Button } from "@/components/ui/button";
import { MarketplaceMark } from "@/components/stores/marketplace-mark";
import { isShippingBlocked } from "@/features/fulfillment/shipping-block";
import type { SupplierHomeOrderRow } from "@/features/supplier-panel/home/home-types";
import { cn } from "@/lib/utils";
import { DeadlineIcon, liveUrgency } from "../orders/countdown-badge";
import { ProblemList, RowAction } from "../orders/order-row-parts";
import { HomeListRow, HomePhoto } from "./home-list";
import { TERM_HINTS } from "@/components/icons/action-icons";
import { HintedText } from "@/components/ui/hint";

/** "Vaso cerâmica P", or "Vaso cerâmica P e mais 1 item": the name the photo stands for. */
export function orderTitle(items: SupplierHomeOrderRow["items"]): string {
  const [first, ...rest] = items;
  if (first === undefined) {
    return "Sem itens";
  }
  if (rest.length === 0) {
    return first.title;
  }
  return `${first.title} e mais ${rest.length} ${rest.length === 1 ? "item" : "itens"}`;
}

export function unitsOf(items: SupplierHomeOrderRow["items"]): number {
  return items.reduce((total, item) => total + item.quantity, 0);
}

/**
 * The deadline as plain text: gray while there is time, amber within the working day, red with
 * the alarm when under two hours or late. Only the pressing ones carry an icon. The group title
 * already says which deadline it is, so the row says only the time ("Atrasado há 3 h").
 */
function DeadlineText({ deadline, now }: { deadline: QueueDeadline | null; now: Date }) {
  const { urgency } = liveUrgency(deadline, now);
  const remainingMilliseconds = deadline === null ? null : deadline.at.getTime() - now.getTime();
  const label = shortCountdownLabel({ deadline, remainingMilliseconds });
  const pressing = urgency === "overdue" || urgency === "danger";
  return (
    <HintedText
      label={urgency === "overdue" ? TERM_HINTS.overdueDeadline : TERM_HINTS.openDeadline}
      focusable={false}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1 text-footnote whitespace-nowrap tabular-nums",
          pressing && "font-medium text-destructive",
          urgency === "warning" && "font-medium text-amber-700 dark:text-amber-300",
          urgency === "normal" && "text-muted-foreground",
        )}
        // The label follows the clock: the server render and hydration may differ by a minute.
        suppressHydrationWarning
      >
        {pressing ? <DeadlineIcon urgency={urgency} className="size-4" /> : null}
        {label}
      </span>
    </HintedText>
  );
}

interface HomeOrderRowProps {
  row: SupplierHomeOrderRow;
  now: Date;
  expanded: boolean;
  pending: boolean;
  onToggle: () => void;
  onAdvance: (row: SupplierHomeOrderRow) => void;
  onOpen: (row: SupplierHomeOrderRow) => void;
}

export function HomeOrderRow({
  row,
  now,
  expanded,
  pending,
  onToggle,
  onAdvance,
  onOpen,
}: HomeOrderRowProps) {
  const title = orderTitle(row.items);
  const units = unitsOf(row.items);
  // `RowAction` already offers "Ver pedido" when the parcel has no step left.
  const offersDetails = isShippingBlocked(row.orderStatus) || row.action !== null;
  return (
    <HomeListRow
      id={row.id}
      expanded={expanded}
      onToggle={onToggle}
      photo={<HomePhoto imageUrl={row.imageUrl} title={title} quantity={units} />}
      title={title}
      detail={
        <>
          {/* The row is a button: the legend opens on hover or tap, not as a stop of its own. */}
          <HintedText label={TERM_HINTS.orderStore} focusable={false} className="shrink-0">
            <MarketplaceMark marketplace={row.marketplace} className="size-4 rounded-[5px]" />
          </HintedText>
          {/* The order number waits in the open row: the closed one stays short to scan. */}
          <span className="truncate">
            {units} un. · {row.destinationCity}, {row.destinationState}
          </span>
        </>
      }
      trailing={<DeadlineText deadline={row.deadline} now={now} />}
    >
      <HomePhoto imageUrl={row.imageUrl} title={title} large />
      <div className="min-w-0 flex-1 space-y-3">
        <ProblemList row={row} />
        <div className="flex flex-wrap items-center gap-2">
          <RowAction
            row={row}
            pending={pending}
            onAdvance={() => onAdvance(row)}
            onOpen={() => onOpen(row)}
          />
          {offersDetails ? (
            <Button size="sm" variant="ghost" onClick={() => onOpen(row)}>
              Ver pedido
            </Button>
          ) : null}
          <span className="ml-auto text-footnote text-muted-foreground tabular-nums">
            Pedido {row.externalOrderId}
          </span>
        </div>
      </div>
    </HomeListRow>
  );
}
