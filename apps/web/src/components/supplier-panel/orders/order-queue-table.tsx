import { DataTable } from "@/components/data/data-table";
import type { SupplierOrderRow } from "@/features/supplier-panel/orders/use-order-actions";
import { DeadlineCell, queueColumnsFor } from "./order-queue-columns";
import { OrderSummary, ProblemList, RowAction, RowCheckbox, StepStatus } from "./order-row-parts";
import { type QueueRowContext, QueueRowContextValue, useQueueRow } from "./queue-row-context";

export type { QueueRowContext } from "./queue-row-context";

/** A phone reads each order as a card: number and countdown on top, the action at the bottom. */
function MobileQueueRow({ row }: { row: SupplierOrderRow }) {
  const context = useQueueRow();
  return (
    <div className="flex gap-3">
      {context.selectable ? (
        <div className="pt-1">
          <RowCheckbox
            row={row}
            checked={context.selectedIds.has(row.id)}
            onToggle={context.onToggle}
          />
        </div>
      ) : null}
      <div className="min-w-0 flex-1 space-y-2.5">
        <OrderSummary row={row} onOpen={context.onOpen} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <StepStatus row={row} />
          <DeadlineCell row={row} now={context.now} />
        </div>
        <ProblemList row={row} />
        <RowAction
          row={row}
          pending={context.pendingId === row.id}
          onAdvance={context.onAdvance}
          onOpen={context.onOpen}
        />
      </div>
    </div>
  );
}

function renderMobileRow(row: SupplierOrderRow) {
  return <MobileQueueRow row={row} />;
}

export function OrderQueueTable({
  rows,
  context,
  footer,
}: {
  rows: SupplierOrderRow[];
  context: QueueRowContext;
  footer?: React.ReactNode;
}) {
  return (
    <QueueRowContextValue value={context}>
      <DataTable
        columns={queueColumnsFor(context.selectable)}
        data={rows}
        getRowId={(row) => row.id}
        caption="Pedidos"
        footer={footer}
        renderMobileRow={renderMobileRow}
      />
    </QueueRowContextValue>
  );
}
