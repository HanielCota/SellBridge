import { useState } from "react";
import { StorefrontIcon } from "@phosphor-icons/react";
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
  status: "connected" | "expired" | "error" | "disconnected";
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

export function CustomerStores({
  userId,
  stores,
}: {
  userId: string;
  stores: readonly CustomerStore[];
}) {
  const [target, setTarget] = useState<CustomerStore | null>(null);
  const disconnect = useAdminAction(
    (storeConnectionId: string) =>
      adminDisconnectCustomerStore({ data: { userId, storeConnectionId } }),
    "Loja desconectada",
    () => setTarget(null),
  );
  return (
    <SectionCard
      title="Lojas conectadas"
      description="Por onde o cliente vende e como está cada conexão."
    >
      {stores.length === 0 ? (
        <NoStores />
      ) : (
        <ul className="-mx-2 space-y-1">
          {stores.map((store) => (
            <li
              key={store.id}
              className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-[background-color,box-shadow] duration-100 hover:row-lift"
            >
              <MarketplaceMark marketplace={store.marketplace} className="size-9 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate text-sm font-medium">{store.shopName}</p>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-footnote text-muted-foreground">
                  {store.marketplaceLabel}
                  <StoreStatusChip status={store.status} />
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setTarget(store)}>
                Desconectar
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => (open ? undefined : setTarget(null))}
        title={`Desconectar ${target?.shopName ?? "loja"}?`}
        description="Os anúncios já publicados continuam no marketplace, mas o SellBridge deixa de sincronizar estoque, preço e pedidos desta loja."
        confirmLabel="Desconectar"
        pendingLabel="Desconectando..."
        destructive
        isPending={disconnect.isPending}
        onConfirm={() => (target ? disconnect.mutate(target.id) : undefined)}
      />
    </SectionCard>
  );
}
