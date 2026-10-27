import { FULFILLMENT_LABELS, type FulfillmentStatus } from "@sellbridge/shared/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";
import { acceptSupplierShipmentsFn, updateSupplierPanelShipmentFn } from "./orders.functions";
import { attentionCountsQueryOptions } from "@/features/navigation/navigation.queries";
import { supplierOrdersKey } from "./orders.queries";

/** One page of the supplier's queue, as the list function returns it. */
export type SupplierOrdersPage = Awaited<
  ReturnType<typeof import("./orders.functions").listSupplierShipmentsFn>
>;
export type SupplierOrderRow = SupplierOrdersPage["items"][number];

export type ShipmentUpdateInput = Parameters<
  typeof updateSupplierPanelShipmentFn
>[0]["data"]["update"];

/** Refreshes the list, the tab counts and the open panel after any write. */
function useRefreshOrders(supplierId: string) {
  const client = useQueryClient();
  return async () =>
    await Promise.all([
      client.invalidateQueries({ queryKey: supplierOrdersKey(supplierId) }),
      client.invalidateQueries({ queryKey: ["supplier-panel", supplierId] }),
      client.invalidateQueries({ queryKey: attentionCountsQueryOptions().queryKey }),
    ]);
}

/** A step or occurrence from the shipment panel, as the supplier. */
export function useSupplierShipmentUpdate(supplierId: string) {
  const refresh = useRefreshOrders(supplierId);
  return async (update: ShipmentUpdateInput) => {
    await updateSupplierPanelShipmentFn({ data: { supplierId, update } });
    await refresh();
  };
}

/** The row's one-click step (accept, start picking, mark ready); shipping opens the panel. */
export function useAdvanceShipment(supplierId: string) {
  const refresh = useRefreshOrders(supplierId);
  return useMutation({
    mutationFn: async (input: { shipmentId: string; status: FulfillmentStatus }) => {
      const update = {
        shipmentId: input.shipmentId,
        status: input.status,
        carrier: "",
        trackingCode: "",
        trackingUrl: "",
        note: "",
      };
      await updateSupplierPanelShipmentFn({ data: { supplierId, update } });
      return input;
    },
    onSuccess: async (input) => {
      toast.success(`Pedido em "${FULFILLMENT_LABELS[input.status]}"`);
      await refresh();
    },
    onError: async (error) => {
      toast.error(errorMessage(error));
      await refresh();
    },
  });
}

/** Accepts several parcels; the report says which went through and why the others did not. */
export function useBatchAccept(supplierId: string) {
  const refresh = useRefreshOrders(supplierId);
  return useMutation({
    mutationFn: async (shipmentIds: string[]) =>
      await acceptSupplierShipmentsFn({ data: { supplierId, shipmentIds } }),
    onSettled: async () => await refresh(),
  });
}
