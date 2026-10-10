import { useState } from "react";
import { StoreStatusBadge } from "@/components/stores/store-status-badge";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { adminDisconnectCustomerStore } from "@/features/admin/customers.functions";
import { SectionCard } from "@/components/layout/section-card";
import { useAdminAction } from "@/features/admin/use-admin-action";

interface CustomerStore {
  id: string;
  shopName: string;
  marketplaceLabel: string;
  status: "connected" | "expired" | "error" | "disconnected";
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
    <SectionCard title="Lojas conectadas">
      {stores.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma loja conectada.</p>
      ) : (
        <ul className="divide-y">
          {stores.map((store) => (
            <li
              key={store.id}
              className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 space-y-1">
                <p className="truncate text-sm font-medium">{store.shopName}</p>
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  {store.marketplaceLabel}
                  <StoreStatusBadge status={store.status} />
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
