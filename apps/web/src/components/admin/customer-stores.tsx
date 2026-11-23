import type { StoreStatus } from "@sellbridge/shared/schemas";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StorefrontIcon, WarningCircleIcon } from "@phosphor-icons/react";
import {
  StoreSupplierDialog,
  type StoreSupplierActions,
  type StoreSupplierOption,
  type StoreSuppliersTarget,
} from "@/components/stores/store-supplier-dialog";
import { MarketplaceMark } from "@/components/stores/marketplace-mark";
import { storeHealth } from "@sellbridge/shared/store-attention";
import { StoreHealthLine } from "@/components/stores/store-health";
import { StoreStatusChip } from "@/components/stores/store-status-badge";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  adminAddStoreSupplier,
  adminDisconnectCustomerStore,
  adminPreviewStoreSupplierRemoval,
  adminRemoveStoreSupplier,
} from "@/features/admin/customers.functions";
import { SectionCard } from "@/components/layout/section-card";
import {
  BuyerAddressReleaseDialog,
  CustomerStoreBuyerAddressLine,
  type CustomerStoreBuyerAddress,
  type ReleaseTarget,
} from "./customer-store-buyer-address";
import { useAdminAction } from "@/features/admin/use-admin-action";

interface CustomerStore {
  id: string;
  shopName: string;
  marketplace: string;
  marketplaceLabel: string;
  status: StoreStatus;
  lastError: string | null;
  lastSyncedAt: Date | null;
  lastWebhookAt: Date | null;
  /** The suppliers the shop sells, oldest first; none while pending. */
  suppliers: readonly StoreSupplierOption[];
  /** The last purchase-address check; null for a shop never checked. */
  buyerAddress: CustomerStoreBuyerAddress | null;
}

const SUPPLIER_LIST_FORMAT = new Intl.ListFormat("pt-BR", { style: "long", type: "conjunction" });

function StoreSupplierLine({ store }: { store: CustomerStore }) {
  if (store.suppliers.length === 0) {
    return (
      <span className="flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
        <WarningCircleIcon weight="fill" className="size-3.5" aria-hidden="true" />
        Fornecedor pendente
      </span>
    );
  }
  return (
    <span>
      Vende{" "}
      <span className="font-medium text-foreground">
        {SUPPLIER_LIST_FORMAT.format(store.suppliers.map((supplier) => supplier.name))}
      </span>
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
  onManageSuppliers,
  onDisconnect,
  onReleaseBuyerAddress,
}: {
  store: CustomerStore;
  onManageSuppliers: () => void;
  onDisconnect: () => void;
  onReleaseBuyerAddress: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl px-2 py-2.5 transition-[background-color,box-shadow] duration-100 hover:row-lift">
      <MarketplaceMark marketplace={store.marketplace} className="size-9 rounded-xl" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-sm font-medium">{store.shopName}</p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-footnote text-muted-foreground">
          {store.marketplaceLabel}
          <StoreStatusChip status={storeHealth(store)} />
        </p>
        <p className="text-footnote text-muted-foreground">
          <StoreSupplierLine store={store} />
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
        <Button size="sm" variant="outline" onClick={onManageSuppliers}>
          {store.suppliers.length === 0 ? "Escolher fornecedor" : "Fornecedores"}
          {store.suppliers.length === 0 ? null : (
            <span className="sr-only"> de {store.shopName}</span>
          )}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDisconnect}>
          Desconectar
        </Button>
      </div>
      {/* Full width under the row, lined up with the text: the buttons never squeeze it. */}
      <div className="basis-full space-y-2 pl-12">
        <StoreHealthLine store={store} />
        <CustomerStoreBuyerAddressLine
          check={store.buyerAddress}
          onRelease={onReleaseBuyerAddress}
        />
      </div>
    </li>
  );
}

/** The team managing the suppliers of a customer's shops; every change lands in the timeline. */
function useCustomerSupplierActions(userId: string): StoreSupplierActions {
  const queryClient = useQueryClient();
  return {
    add: (change) => adminAddStoreSupplier({ data: { userId, ...change } }),
    remove: (change) => adminRemoveStoreSupplier({ data: { userId, ...change } }),
    previewRemoval: (change) => adminPreviewStoreSupplierRemoval({ data: { userId, ...change } }),
    refresh: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
    previewKey: "customers",
    reactivateNote: "se o fornecedor voltar à loja, o cliente pode reativar os anúncios.",
  };
}

/** The shop whose suppliers the team manages, read live so the dialog follows each change. */
function suppliersTargetOf(
  stores: readonly CustomerStore[],
  storeId: string | null,
): StoreSuppliersTarget | null {
  const store = stores.find((item) => item.id === storeId);
  if (store === undefined) {
    return null;
  }
  return { storeId: store.id, storeName: store.shopName, suppliers: store.suppliers };
}

function releaseTargetOf(store: CustomerStore): ReleaseTarget {
  return {
    storeConnectionId: store.id,
    shopName: store.shopName,
    supplierName: store.buyerAddress?.supplierName ?? null,
  };
}

function DisconnectStoreDialog({
  userId,
  target,
  onClose,
}: {
  userId: string;
  target: CustomerStore | null;
  onClose: () => void;
}) {
  const disconnect = useAdminAction(
    (storeConnectionId: string) =>
      adminDisconnectCustomerStore({ data: { userId, storeConnectionId } }),
    "Loja desconectada",
    onClose,
  );
  return (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={`Desconectar ${target?.shopName ?? "loja"}?`}
      description="Os anúncios já publicados continuam no marketplace, mas o SellBridge para de atualizar estoque, preço e pedidos desta loja."
      confirmLabel="Desconectar"
      pendingLabel="Desconectando…"
      destructive
      isPending={disconnect.isPending}
      onConfirm={() => (target ? disconnect.mutate(target.id) : undefined)}
    />
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
  const [suppliersStoreId, setSuppliersStoreId] = useState<string | null>(null);
  const [releaseTarget, setReleaseTarget] = useState<ReleaseTarget | null>(null);
  const supplierActions = useCustomerSupplierActions(userId);
  return (
    <SectionCard
      title="Lojas conectadas"
      description="Por onde o cliente vende, os fornecedores de cada loja e como está cada conexão."
    >
      {stores.length === 0 ? (
        <NoStores />
      ) : (
        <ul className="-mx-2 space-y-1">
          {stores.map((store) => (
            <StoreRow
              key={store.id}
              store={store}
              onManageSuppliers={() => setSuppliersStoreId(store.id)}
              onDisconnect={() => setTarget(store)}
              onReleaseBuyerAddress={() => setReleaseTarget(releaseTargetOf(store))}
            />
          ))}
        </ul>
      )}
      <DisconnectStoreDialog userId={userId} target={target} onClose={() => setTarget(null)} />
      <StoreSupplierDialog
        target={suppliersTargetOf(stores, suppliersStoreId)}
        actions={supplierActions}
        onClose={() => setSuppliersStoreId(null)}
      />
      <BuyerAddressReleaseDialog
        userId={userId}
        target={releaseTarget}
        onClose={() => setReleaseTarget(null)}
      />
    </SectionCard>
  );
}
