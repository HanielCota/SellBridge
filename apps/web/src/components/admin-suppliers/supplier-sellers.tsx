import type { SupplierSellerStore } from "@sellbridge/database/repositories";
import { StorefrontIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { SectionCard } from "@/components/layout/section-card";
import { MarketplaceMark } from "@/components/stores/marketplace-mark";

/** The shops of one reseller that sell the supplier. */
interface SellerGroup {
  tenantId: string;
  ownerId: string | null;
  ownerName: string;
  recentOrders: number;
  stores: SupplierSellerStore[];
}

/** One row per reseller, however many of their shops sell the supplier. */
export function groupSellers(stores: readonly SupplierSellerStore[]): SellerGroup[] {
  const groups = new Map<string, SellerGroup>();
  for (const store of stores) {
    const group = groups.get(store.tenantId) ?? {
      tenantId: store.tenantId,
      ownerId: store.ownerId,
      ownerName: store.ownerName ?? "Lojista sem dono",
      recentOrders: store.recentOrders,
      stores: [],
    };
    groups.set(store.tenantId, { ...group, stores: [...group.stores, store] });
  }
  return [...groups.values()];
}

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString("pt-BR")} ${count === 1 ? one : many}`;
}

/** "3 lojas de 2 lojistas": the reach of the supplier, and of deactivating it. */
export function sellersSummary(stores: readonly SupplierSellerStore[]): string {
  const sellers = groupSellers(stores).length;
  return `${plural(stores.length, "loja", "lojas")} de ${plural(sellers, "lojista", "lojistas")}`;
}

function SellerName({ group }: { group: SellerGroup }) {
  if (group.ownerId === null) {
    return <span className="truncate text-sm font-medium">{group.ownerName}</span>;
  }
  return (
    <Link
      to="/admin/clientes/$userId"
      params={{ userId: group.ownerId }}
      className="truncate text-sm font-medium text-brand-text underline-offset-4 hover:underline"
    >
      {group.ownerName}
    </Link>
  );
}

function SellerRow({ group }: { group: SellerGroup }) {
  return (
    <li className="flex items-center gap-3 rounded-xl px-2 py-2.5">
      <span className="flex -space-x-2">
        {group.stores.slice(0, 3).map((store) => (
          <MarketplaceMark
            key={store.storeConnectionId}
            marketplace={store.marketplace}
            className="size-8 rounded-lg ring-2 ring-card"
          />
        ))}
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <SellerName group={group} />
        <p className="truncate text-footnote text-muted-foreground">
          {group.stores.map((store) => store.shopName).join(", ")}
        </p>
      </div>
      <p className="shrink-0 text-right text-footnote text-muted-foreground tabular-nums">
        <span className="block text-sm font-medium text-foreground">
          {group.recentOrders.toLocaleString("pt-BR")}
        </span>
        pedidos em 30 dias
      </p>
    </li>
  );
}

/** Who sells this supplier now: each shop sells a single supplier. */
export function SupplierSellers({ stores }: { stores: readonly SupplierSellerStore[] }) {
  const groups = groupSellers(stores);
  return (
    <SectionCard
      title="Lojistas vinculados"
      description={
        stores.length === 0
          ? "Nenhuma loja vende este fornecedor ainda."
          : `${sellersSummary(stores)} vendem este fornecedor.`
      }
    >
      {groups.length === 0 ? (
        <p className="flex items-center gap-2 px-2 text-footnote text-muted-foreground">
          <StorefrontIcon className="size-4" aria-hidden="true" />
          Quando um lojista conectar uma loja para este fornecedor, ela aparece aqui.
        </p>
      ) : (
        <ul className="-mx-2 space-y-1">
          {groups.map((group) => (
            <SellerRow key={group.tenantId} group={group} />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
