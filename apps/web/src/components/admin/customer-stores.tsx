import type { StoreStatus } from "@sellbridge/shared/schemas";
import { useState } from "react";
import { StorefrontIcon, WarningCircleIcon } from "@phosphor-icons/react";
import {
  AdminStoreSupplierDialog,
  type AdminStoreSupplierTarget,
} from "@/components/admin/admin-store-supplier-dialog";
import { MarketplaceMark } from "@/components/stores/marketplace-mark";
import { StoreStatusChip } from "@/components/stores/store-status-badge";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { adminDisconnectCustomerStore } from "@/features/admin/customers.functions";
import { SectionCard } from "@/components/layout/section-card";
import { useAdminAction } from "@/features/admin/use-admin-action";

interface CustomerStore {
  id: string;
  shopName: string;
  marketplace: string;
  marketplaceLabel: string;
  status: StoreStatus;
  /** The one supplier the shop sells; null while pending. */
  supplier: { id: string; name: string } | null;
}

function StoreSupplierLine({ store }: { store: CustomerStore }) {
  if (store.supplier === null) {
    return (
      <span className="flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
        <WarningCircleIcon weight="fill" className="size-3.5" aria-hidden="true" />
        Fornecedor pendente
      </span>
    );
  }
  return (
    <span>
      Vende <span className="font-medium text-foreground">{store.supplier.name}</span>
    </span>
  );
}

function NoStores() {
  return (
    <div className="flex items-center gap-3 px-2 py-2.5">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted">
        <StorefrontIcon weight="duotone" className="size-5 text-muted-foreground" />
      </span>
      <p className="text-footnote text-muted-foreground">
        <span className="block text-sm font-medium text-foreground">Nenhuma loja</span>O cliente
        ainda não conectou um marketplace.
      </p>
    </div>
  );
}

function StoreRow({
  store,
  onChangeSupplier,
  onDisconnect,
}: {
  store: CustomerStore;
  onChangeSupplier: () => void;
  onDisconnect: () => void;
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-[background-color,box-shadow] duration-100 hover:row-lift">
      <MarketplaceMark marketplace={store.marketplace} className="size-9 rounded-xl" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-sm font-medium">{store.shopName}</p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-footnote text-muted-foreground">
          {store.marketplaceLabel}
          <StoreStatusChip status={store.status} />
        </p>
        <p className="text-footnote text-muted-foreground">
          <StoreSupplierLine store={store} />
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
        <Button size="sm" variant="outline" onClick={onChangeSupplier}>
          {store.supplier === null ? "Escolher fornecedor" : "Trocar fornecedor"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDisconnect}>
          Desconectar
        </Button>
      </div>
    </li>
  );
}

export function CustomerStores({
  userId,
  stores,
}: {
  userId: string;
  stores: readonly CustomerStore[];
}) {
  const [target, setTarget] = useState<CustomerStore | null>(null);
  const [supplierTarget, setSupplierTarget] = useState<AdminStoreSupplierTarget | null>(null);
  const disconnect = useAdminAction(
    (storeConnectionId: string) =>
      adminDisconnectCustomerStore({ data: { userId, storeConnectionId } }),
    "Loja desconectada",
    () => setTarget(null),
  );
  return (
    <SectionCard
      title="Lojas conectadas"
      description="Por onde o cliente vende, o fornecedor de cada loja e como está cada conexão."
    >
      {stores.length === 0 ? (
        <NoStores />
      ) : (
        <ul className="-mx-2 space-y-1">
          {stores.map((store) => (
            <StoreRow
              key={store.id}
              store={store}
              onChangeSupplier={() =>
                setSupplierTarget({
                  userId,
                  storeId: store.id,
                  storeName: store.shopName,
                  currentSupplierId: store.supplier?.id ?? null,
                })
              }
              onDisconnect={() => setTarget(store)}
            />
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => (open ? undefined : setTarget(null))}
        title={`Desconectar ${target?.shopName ?? "loja"}?`}
        description="Os anúncios já publicados continuam no marketplace, mas o SellBridge deixa de sincronizar estoque, preço e pedidos desta loja."
        confirmLabel="Desconectar"
        pendingLabel="Desconectando…"
        destructive
        isPending={disconnect.isPending}
        onConfirm={() => (target ? disconnect.mutate(target.id) : undefined)}
      />
      <AdminStoreSupplierDialog target={supplierTarget} onClose={() => setSupplierTarget(null)} />
    </SectionCard>
  );
}
