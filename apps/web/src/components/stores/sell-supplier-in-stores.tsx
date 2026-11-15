import { useMutation } from "@tanstack/react-query";
import { CheckIcon, PlusIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { STORES_LOCKED_REASON, useStoresLocked } from "@/components/stores/stores-lock";
import { addStoreSupplierFn } from "@/features/stores/store-suppliers.functions";
import { errorMessage } from "@/lib/errors";
import { GroupedList, MarkSlot } from "./grouped-list";
import { MarketplaceMark } from "./marketplace-mark";
import { useInvalidateStores } from "./store-supplier-dialog";

/** A shop of the account that could start selling the supplier the reseller came for. */
export interface SellSupplierStore {
  id: string;
  shopName: string;
  marketplace: string;
  marketplaceLabel: string;
  /** The shop already sells this supplier. */
  sells: boolean;
}

/** The supplier the reseller chose on its page ("Vender este fornecedor"). */
export interface SellSupplierChoice {
  id: string;
  name: string;
}

function useAddToStore(supplier: SellSupplierChoice) {
  const invalidate = useInvalidateStores();
  return useMutation({
    mutationFn: (store: SellSupplierStore) =>
      addStoreSupplierFn({ data: { storeConnectionId: store.id, supplierId: supplier.id } }),
    onSuccess: async (_result, store) => {
      await invalidate();
      toast.success(`${supplier.name} adicionado a ${store.shopName}`);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
}

function StoreChoiceAction({
  store,
  supplierName,
  isAdding,
  disabled,
  onAdd,
}: {
  store: SellSupplierStore;
  supplierName: string;
  isAdding: boolean;
  disabled: boolean;
  onAdd: () => void;
}) {
  if (store.sells) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-footnote font-medium text-emerald-800 dark:text-emerald-300">
        <CheckIcon weight="bold" className="size-3.5" aria-hidden="true" />
        Já vende
      </span>
    );
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="shrink-0"
      disabled={disabled}
      title={disabled && !isAdding ? STORES_LOCKED_REASON : undefined}
      onClick={onAdd}
    >
      <PlusIcon weight="bold" aria-hidden="true" />
      {isAdding ? "Adicionando…" : "Adicionar"}
      <span className="sr-only">
        {" "}
        {supplierName} a {store.shopName}
      </span>
    </Button>
  );
}

/**
 * "Vender este fornecedor" with shops already connected: the supplier goes into one of them, so
 * the reseller does not need a new shop to sell it. A new shop stays possible right below.
 */
export function SellSupplierInStores({
  supplier,
  stores,
}: {
  supplier: SellSupplierChoice;
  stores: readonly SellSupplierStore[];
}) {
  const locked = useStoresLocked();
  const mutation = useAddToStore(supplier);
  if (stores.length === 0) {
    return null;
  }
  return (
    <div className="space-y-2">
      <h2 className="px-5 text-footnote font-normal text-muted-foreground">
        Vender {supplier.name} numa loja que você já tem
      </h2>
      <GroupedList>
        {stores.map((store) => {
          const isAdding = mutation.isPending && mutation.variables.id === store.id;
          return (
            <li key={store.id} className="flex items-center gap-4 px-5 py-3.5">
              <MarkSlot>
                <MarketplaceMark marketplace={store.marketplace} className="size-10" />
              </MarkSlot>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 block font-medium break-words">{store.shopName}</span>
                <span className="block truncate text-sm text-muted-foreground">
                  {store.marketplaceLabel}
                </span>
              </span>
              <StoreChoiceAction
                store={store}
                supplierName={supplier.name}
                isAdding={isAdding}
                disabled={locked || mutation.isPending}
                onAdd={() => mutation.mutate(store)}
              />
            </li>
          );
        })}
      </GroupedList>
      <p className="px-5 text-sm text-muted-foreground">
        Ou conecte uma loja nova para {supplier.name} logo abaixo.
      </p>
    </div>
  );
}
