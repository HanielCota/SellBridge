import type { SupplierOrdersUrlSearch } from "@sellbridge/shared/supplier-panel-orders-schema";
import type { SupplierOrderTab } from "@sellbridge/shared/supplier-panel-orders-tabs";
import { CheckCircleIcon, MagnifyingGlassIcon, PackageIcon } from "@phosphor-icons/react";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PaginationBar } from "@/components/data/pagination-bar";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { BatchAcceptReport } from "@/features/supplier-panel/orders/batch-accept";
import { supplierShipmentsQueryOptions } from "@/features/supplier-panel/orders/orders.queries";
import {
  type SupplierOrderRow,
  type SupplierOrdersPage,
  useAdvanceShipment,
} from "@/features/supplier-panel/orders/use-order-actions";
import { toggled, withAll } from "@/features/supplier-panel/orders/selection";
import { useNow } from "@/hooks/use-now";
import { errorMessage } from "@/lib/errors";
import { BatchAcceptBar, BatchAcceptResult } from "./batch-accept-bar";
import { OrderFilters } from "./order-filters";
import { OrderQueueTable, type QueueRowContext } from "./order-queue-table";
import { ShipmentPanelDialog } from "./shipment-panel-dialog";

/** Tabs where parcels wait for the accept, so the batch checkboxes show. */
const SELECTABLE_TABS: ReadonlySet<SupplierOrderTab> = new Set(["todo", "forwarded", "problem"]);

function EmptyOrders({ tab, searching }: { tab: SupplierOrderTab; searching: boolean }) {
  if (searching) {
    return (
      <EmptyState
        icon={MagnifyingGlassIcon}
        title="Nenhum pedido encontrado"
        description="Confira o número ou SKU, ou procure em outra aba."
      />
    );
  }
  if (tab === "todo" || tab === "problem") {
    return (
      <EmptyState
        icon={CheckCircleIcon}
        title={tab === "todo" ? "Fila vazia" : "Sem problemas"}
        description={
          tab === "todo"
            ? "Pedidos encaminhados aparecem aqui com o prazo de aceite."
            : "Pedidos atrasados ou bloqueados aparecem aqui."
        }
      />
    );
  }
  return (
    <EmptyState
      icon={PackageIcon}
      title="Etapa vazia"
      description="Pedidos aparecem aqui ao chegar nesta etapa."
    />
  );
}

/** The orders picked for a batch accept; updates read the latest state, so quick clicks add up. */
function useSelection() {
  const [selected, setSelected] = useState<ReadonlyMap<string, SupplierOrderRow>>(new Map());
  return {
    selected,
    toggle: (row: SupplierOrderRow) => setSelected((previous) => toggled(previous, row)),
    toggleAll: (rows: readonly SupplierOrderRow[], checked: boolean) =>
      setSelected((previous) => withAll(previous, rows, checked)),
    clear: () => setSelected(new Map()),
  };
}

type BatchOutcome = { report: BatchAcceptReport; orderNumbers: ReadonlyMap<string, string> };

/** What each row reads and does: the clock, the batch selection, the one-click step, the panel. */
function useQueueContext(input: {
  supplierId: string;
  tab: SupplierOrderTab;
  selection: ReturnType<typeof useSelection>;
  onOpen: (row: SupplierOrderRow) => void;
}): QueueRowContext {
  const now = useNow();
  const advance = useAdvanceShipment(input.supplierId);
  return {
    now,
    selectable: SELECTABLE_TABS.has(input.tab),
    selectedIds: new Set(input.selection.selected.keys()),
    pendingId: advance.isPending ? advance.variables.shipmentId : null,
    onToggle: input.selection.toggle,
    onToggleAll: input.selection.toggleAll,
    onAdvance: (row) => {
      if (row.action === null) {
        return;
      }
      advance.mutate({ shipmentId: row.id, status: row.action.status });
    },
    onOpen: input.onOpen,
  };
}

/**
 * The supplier's Pedidos: a deadline-first queue across every reseller, one action per row,
 * batch accept with a per-order report, and the shipment panel for everything else.
 */
export function SupplierOrdersInbox({
  supplierId,
  search,
  onSearchChange,
}: {
  supplierId: string;
  search: SupplierOrdersUrlSearch;
  onSearchChange: (patch: Partial<SupplierOrdersUrlSearch>) => void;
}) {
  const selection = useSelection();
  const [opened, setOpened] = useState<SupplierOrderRow | null>(null);
  const [outcome, setOutcome] = useState<BatchOutcome | null>(null);
  const context = useQueueContext({ supplierId, tab: search.tab, selection, onOpen: setOpened });
  const query = useQuery(
    supplierShipmentsQueryOptions({
      supplierId,
      tab: search.tab,
      query: search.query ?? "",
      page: search.page,
    }),
  );
  const changeSearch = (patch: Partial<SupplierOrdersUrlSearch>) => {
    selection.clear();
    onSearchChange(patch);
  };
  return (
    <section className="space-y-4" aria-label="Pedidos">
      <OrderFilters supplierId={supplierId} search={search} onChange={changeSearch} />
      {outcome === null ? null : (
        <BatchAcceptResult
          report={outcome.report}
          orderNumbers={outcome.orderNumbers}
          onDismiss={() => setOutcome(null)}
        />
      )}
      <OrdersBody
        query={query}
        tab={search.tab}
        searching={(search.query ?? "") !== ""}
        context={context}
        onPageChange={(page) => changeSearch({ page })}
      />
      <BatchAcceptBar
        supplierId={supplierId}
        selected={[...selection.selected.values()]}
        onClear={selection.clear}
        onDone={(report, orderNumbers) => {
          selection.clear();
          setOutcome({ report, orderNumbers });
        }}
      />
      <ShipmentPanelDialog
        supplierId={supplierId}
        opened={opened}
        onClose={() => setOpened(null)}
      />
    </section>
  );
}

function OrdersBody({
  query,
  tab,
  searching,
  context,
  onPageChange,
}: {
  query: UseQueryResult<SupplierOrdersPage>;
  tab: SupplierOrderTab;
  searching: boolean;
  context: QueueRowContext;
  onPageChange: (page: number) => void;
}) {
  if (query.isPending) {
    return <Skeleton className="h-72 rounded-3xl" />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (query.data.items.length === 0) {
    return <EmptyOrders tab={tab} searching={searching} />;
  }
  return (
    <div aria-busy={query.isFetching} className="space-y-4">
      <OrderQueueTable rows={query.data.items} context={context} />
      <PaginationBar
        page={query.data.page}
        totalPages={query.data.totalPages}
        total={query.data.total}
        itemLabel={{ one: "pedido", other: "pedidos" }}
        onPageChange={onPageChange}
      />
    </div>
  );
}
