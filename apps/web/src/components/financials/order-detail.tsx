import type { OrderFinancialRow } from "@sellbridge/database/repositories";
import { OrderStatusBadge } from "@/components/reports/order-status-badge";
import { PopoverContent } from "@/components/ui/popover";
import { displayBuyerName } from "@/features/orders/buyer-name";
import { formatAbsoluteTime } from "@/lib/relative-time";
import { marginLabel, OrderBreakdown, OrderSplitBar } from "./order-parts";

/** One order's arithmetic, opened from a statement row: what came in, went out and was left. */
export function OrderDetail({ row }: { row: OrderFinancialRow }) {
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
