import { SmartDate } from "@/components/data/smart-date";
import { createServerColumnHelper } from "@/components/data/data-table";
import { Checkbox } from "@/components/ui/checkbox";
import { isShippingBlocked } from "@/features/fulfillment/shipping-block";
import type { SupplierOrderRow } from "@/features/supplier-panel/orders/use-order-actions";
import { CountdownBadge } from "./countdown-badge";
import {
  isBatchSelectable,
  OrderSummary,
  ProblemList,
  RowAction,
  RowCheckbox,
  StepStatus,
} from "./order-row-parts";
import { useQueueRow } from "./queue-row-context";

/** "Prazo" in the queue; "Atualizado" in the history tabs, where nothing is due. */
export function DeadlineCell({ row, now }: { row: SupplierOrderRow; now: Date }) {
  // A sale not released for shipping has nothing due: its reason stands alone.
  if (isShippingBlocked(row.orderStatus)) {
    return null;
  }
  if (row.deadline === null) {
    return <SmartDate date={row.updatedAt} className="text-footnote text-muted-foreground" />;
  }
  return <CountdownBadge deadline={row.deadline} now={now} />;
}

function SelectAllHeader({ rows }: { rows: readonly SupplierOrderRow[] }) {
  const context = useQueueRow();
  const selectableRows = rows.filter(isBatchSelectable);
  const allChecked =
    selectableRows.length > 0 && selectableRows.every((row) => context.selectedIds.has(row.id));
  return (
    <Checkbox
      checked={allChecked}
      disabled={selectableRows.length === 0}
      onCheckedChange={(checked) => context.onToggleAll(selectableRows, checked === true)}
      aria-label="Selecionar todos desta página"
    />
  );
}

function SelectCell({ row }: { row: SupplierOrderRow }) {
  const context = useQueueRow();
  return (
    <RowCheckbox row={row} checked={context.selectedIds.has(row.id)} onToggle={context.onToggle} />
  );
}

function OrderCell({ row }: { row: SupplierOrderRow }) {
  const context = useQueueRow();
  // Capped so the items line truncates instead of pushing the action out of the card.
  return (
    <div className="md:max-w-52 lg:max-w-sm xl:max-w-md">
      <OrderSummary row={row} onOpen={context.onOpen} />
    </div>
  );
}

function StatusCell({ row }: { row: SupplierOrderRow }) {
  const context = useQueueRow();
  // On a tablet the step and the countdown stack, leaving room for the action.
  return (
    <div className="space-y-1.5 whitespace-normal md:max-w-44 lg:max-w-none">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <StepStatus row={row} />
        <DeadlineCell row={row} now={context.now} />
      </div>
      <ProblemList row={row} />
    </div>
  );
}

function ActionCell({ row }: { row: SupplierOrderRow }) {
  const context = useQueueRow();
  return (
    <div className="flex justify-end">
      <RowAction
        row={row}
        pending={context.pendingId === row.id}
        onAdvance={context.onAdvance}
        onOpen={context.onOpen}
      />
    </div>
  );
}

const columnHelper = createServerColumnHelper<SupplierOrderRow>();

const selectColumn = columnHelper.display({
  id: "select",
  header: (info) => (
    <SelectAllHeader rows={info.table.getRowModel().rows.map((row) => row.original)} />
  ),
  cell: (info) => <SelectCell row={info.row.original} />,
});

const contentColumns = [
  columnHelper.display({
    id: "order",
    header: "Pedido",
    cell: (info) => <OrderCell row={info.row.original} />,
  }),
  columnHelper.display({
    id: "status",
    header: "Etapa e prazo",
    cell: (info) => <StatusCell row={info.row.original} />,
  }),
  columnHelper.display({
    id: "action",
    header: () => <span className="sr-only">Ação</span>,
    cell: (info) => <ActionCell row={info.row.original} />,
  }),
];

/**
 * Built once, at module load: `FlexRender` mounts each `cell` and `header` function as a
 * component type, so they must keep their identity between renders or every cell remounts.
 */
const COLUMNS_WITH_SELECTION = columnHelper.columns([selectColumn, ...contentColumns]);
const COLUMNS_WITHOUT_SELECTION = columnHelper.columns(contentColumns);

export function queueColumnsFor(selectable: boolean) {
  return selectable ? COLUMNS_WITH_SELECTION : COLUMNS_WITHOUT_SELECTION;
}
