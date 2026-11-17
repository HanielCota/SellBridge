import type { SupplierTestOrderStep } from "@sellbridge/database/repositories";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";
import {
  advanceSupplierTestOrderFn,
  createSupplierTestOrderFn,
  deleteSupplierTestOrderFn,
  getSupplierTestOrderFn,
} from "./test-order.functions";
import { testOrderStepLabel } from "./test-order-steps";

const testOrderKey = (supplierId: string) => ["supplier-panel", "test-order", supplierId];

export const supplierTestOrderQueryOptions = (supplierId: string) =>
  queryOptions({
    queryKey: testOrderKey(supplierId),
    queryFn: () => getSupplierTestOrderFn({ data: { supplierId } }),
  });

export type SupplierTestOrderView = NonNullable<Awaited<ReturnType<typeof getSupplierTestOrderFn>>>;

function onError(error: unknown) {
  toast.error(errorMessage(error));
}

/** Create, advance and delete, each refreshing the card and saying what happened. */
export function useTestOrderActions(supplierId: string) {
  const client = useQueryClient();
  const refresh = async () =>
    await client.invalidateQueries({ queryKey: testOrderKey(supplierId) });
  const create = useMutation({
    mutationFn: async () => await createSupplierTestOrderFn({ data: { supplierId } }),
    onSuccess: async () => {
      await refresh();
      toast.success("Pedido de teste criado. Siga as etapas para ver como ele anda.");
    },
    onError,
  });
  const advance = useMutation({
    mutationFn: async (input: { testOrderId: string; from: SupplierTestOrderStep }) =>
      await advanceSupplierTestOrderFn({ data: { supplierId, ...input } }),
    onSuccess: async (updated) => {
      await refresh();
      toast.success(`Pedido de teste: ${testOrderStepLabel(updated.step).toLowerCase()}`);
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: async (testOrderId: string) =>
      await deleteSupplierTestOrderFn({ data: { supplierId, testOrderId } }),
    onSuccess: async () => {
      await refresh();
      toast.success("Pedido de teste apagado");
    },
    onError,
  });
  return { create, advance, remove };
}
