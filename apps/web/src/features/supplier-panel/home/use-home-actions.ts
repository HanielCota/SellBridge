import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { isBatchSelectable } from "@/components/supplier-panel/orders/order-row-parts";
import { errorMessage } from "@/lib/errors";
import type { BatchAcceptReport } from "../orders/batch-accept";
import { useAdvanceShipment, useBatchAccept } from "../orders/use-order-actions";
import type { SupplierHomeOrderRow } from "./home-types";
import { supplierHomeQueryOptions } from "./home.queries";

function announceBatch(report: BatchAcceptReport) {
  if (report.acceptedCount > 0) {
    const noun = report.acceptedCount === 1 ? "pedido aceito" : "pedidos aceitos";
    toast.success(`${report.acceptedCount} ${noun}`);
  }
  if (report.failedCount > 0) {
    const noun = report.failedCount === 1 ? "pedido não foi aceito" : "pedidos não foram aceitos";
    toast.warning(`${report.failedCount} ${noun}. Veja o motivo em Pedidos.`);
  }
}

/**
 * The home list's writes, the same ones the Pedidos queue makes: the row's one-click step and the
 * batch accept. Both refresh the home too, since its query is not under the orders' key.
 */
export function useHomeActions(supplierId: string) {
  const client = useQueryClient();
  const advance = useAdvanceShipment(supplierId);
  const batch = useBatchAccept(supplierId);
  const refresh = async () =>
    await client.invalidateQueries({ queryKey: supplierHomeQueryOptions(supplierId).queryKey });
  const advanceRow = (row: SupplierHomeOrderRow) => {
    if (row.action === null) {
      return;
    }
    const input = { shipmentId: row.id, status: row.action.status };
    advance.mutate(input, { onSettled: () => void refresh() });
  };
  const acceptAll = (rows: readonly SupplierHomeOrderRow[]) => {
    const shipmentIds = rows.filter((row) => isBatchSelectable(row)).map((row) => row.id);
    batch.mutate(shipmentIds, {
      onSuccess: announceBatch,
      onError: (error) => toast.error(errorMessage(error)),
      onSettled: () => void refresh(),
    });
  };
  return {
    pendingId: advance.isPending ? advance.variables.shipmentId : null,
    batchPending: batch.isPending,
    advanceRow,
    acceptAll,
    refresh,
  };
}
