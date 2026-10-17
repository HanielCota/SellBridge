import { SmartDate } from "@/components/data/smart-date";
import { createServerColumnHelper, DataTable } from "@/components/data/data-table";
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

/** What every row needs from the inbox: the clock, the selection and the two ways to act. */
export interface QueueRowContext {
  now: Date;
  selectable: boolean;
  selectedIds: ReadonlySet<string>;
  pendingId: string | null;
  onToggle: (row: SupplierOrderRow) => void;
  onToggleAll: (rows: readonly SupplierOrderRow[], checked: boolean) => void;
  onAdvance: (row: SupplierOrderRow) => void;
  onOpen: (row: SupplierOrderRow) => void;
}

const columnHelper = createServerColumnHelper<SupplierOrderRow>();

/** "Prazo" in the queue; "Atualizado" in the history tabs, where nothing is due. */
function DeadlineCell({ row, now }: { row: SupplierOrderRow; now: Date }) {
  // A sale not released for shipping has nothing due: its reason stands alone.
  if (isShippingBlocked(row.orderStatus)) {
    return null;
  }
  if (row.deadline === null) {
    return <SmartDate date={row.updatedAt} className="text-footnote text-muted-foreground" />;
  }
  return <CountdownBadge deadline={row.deadline} now={now} />;
}

function selectionColumn(rows: readonly SupplierOrderRow[], context: QueueRowContext) {
  const selectableRows = rows.filter(isBatchSelectable);
  const allChecked =
    selectableRows.length > 0 && selectableRows.every((row) => context.selectedIds.has(row.id));
  return columnHelper.display({
    id: "select",
    header: () => (
      <Checkbox
        checked={allChecked}
        disabled={selectableRows.length === 0}
        onCheckedChange={(checked) => context.onToggleAll(selectableRows, checked === true)}
        aria-label="Selecionar todos os pedidos para aceitar desta página"
      />
    ),
    cell: (info) => (
      <RowCheckbox
        row={info.row.original}
        checked={context.selectedIds.has(info.row.original.id)}
        onToggle={context.onToggle}
      />
    ),
  });
}

function queueColumns(rows: readonly SupplierOrderRow[], context: QueueRowContext) {
  const columns = [
    columnHelper.display({
      id: "order",
      header: "Pedido",
      // Capped so the items line truncates instead of pushing the action out of the card.
      cell: (info) => (
        <div className="md:max-w-52 lg:max-w-sm xl:max-w-md">
          <OrderSummary row={info.row.original} onOpen={context.onOpen} />
        </div>
      ),
    }),
    columnHelper.display({
      id: "status",
      header: "Etapa e prazo",
      // On a tablet the step and the countdown stack, leaving room for the action.
      cell: (info) => (
        <div className="space-y-1.5 whitespace-normal md:max-w-44 lg:max-w-none">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <StepStatus row={info.row.original} />
            <DeadlineCell row={info.row.original} now={context.now} />
          </div>
          <ProblemList row={info.row.original} />
        </div>
      ),
    }),
    columnHelper.display({
      id: "action",
      header: () => <span className="sr-only">Ação</span>,
      cell: (info) => (
        <div className="flex justify-end">
          <RowAction
            row={info.row.original}
            pending={context.pendingId === info.row.original.id}
            onAdvance={context.onAdvance}
            onOpen={context.onOpen}
          />
        </div>
      ),
    }),
  ];
  if (!context.selectable) {
    return columnHelper.columns(columns);
  }
  return columnHelper.columns([selectionColumn(rows, context), ...columns]);
}

/** A phone reads each order as a card: number and countdown on top, the action at the bottom. */
function MobileQueueRow({ row, context }: { row: SupplierOrderRow; context: QueueRowContext }) {
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
    <DataTable
      columns={queueColumns(rows, context)}
      data={rows}
      getRowId={(row) => row.id}
      caption="Pedidos do fornecedor"
      footer={footer}
      renderMobileRow={(row) => <MobileQueueRow row={row} context={context} />}
    />
  );
}
