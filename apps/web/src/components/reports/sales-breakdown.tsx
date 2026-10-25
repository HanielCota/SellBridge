import { formatCents } from "@sellbridge/shared/money";
import { profitMargin } from "@/features/reports/dashboard-insights";
import { BreakdownSection } from "@/components/reports/breakdown-section";
import { displayStoreName } from "@/features/stores/store-name";
import { formatPercent } from "@/lib/percent";

interface StoreRow {
  storeConnectionId: string;
  storeName: string;
  orders: number;
  revenueCents: number;
  profitCents: number;
  pendingCostRevenueCents: number;
}

interface ProductRow {
  title: string;
  units: number;
  revenueCents: number;
}

function EmptyRows() {
  return (
    <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma venda no período.</p>
  );
}

/** "12% de margem" over the revenue whose cost is known; "custo pendente" when none is known. */
function marginText(store: StoreRow): string {
  const margin = profitMargin(store);
  if (margin !== null) {
    return `${formatPercent(margin)} de margem`;
  }
  return store.pendingCostRevenueCents > 0 ? "custo pendente" : `${formatPercent(0)} de margem`;
}

function StoreShare({ store, totalRevenue }: { store: StoreRow; totalRevenue: number }) {
  const share = totalRevenue > 0 ? store.revenueCents / totalRevenue : 0;
  const name = displayStoreName(store.storeName);
  return (
    <li className="space-y-2">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate font-medium" title={name}>
          {name}
        </span>
        <span className="shrink-0 font-medium tabular-nums">{formatCents(store.revenueCents)}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 rounded-full bg-muted" aria-hidden="true">
          <div
            className="h-full rounded-full bg-chart-brand"
            style={{ width: `${Math.max(2, Math.round(share * 100))}%` }}
          />
        </div>
        <span className="w-10 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
          {formatPercent(share)}
          <span className="sr-only"> da receita</span>
        </span>
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        {store.orders} {store.orders === 1 ? "venda" : "vendas"} · lucro{" "}
        {formatCents(store.profitCents)} · {marginText(store)}
      </p>
    </li>
  );
}

/** Each store's share of revenue, with orders, profit and margin as secondary facts. */
export function StoreBreakdown({ stores }: { stores: StoreRow[] }) {
  const totalRevenue = stores.reduce((sum, store) => sum + store.revenueCents, 0);
  const totalOrders = stores.reduce((sum, store) => sum + store.orders, 0);
  return (
    <BreakdownSection title="Vendas por loja" to="/lojas" hint="Ver todas as suas lojas">
      {stores.length === 0 ? (
        <EmptyRows />
      ) : (
        <>
          <ul className="space-y-5">
            {stores.map((store) => (
              <StoreShare key={store.storeConnectionId} store={store} totalRevenue={totalRevenue} />
            ))}
          </ul>
          {/* Pinned to the bottom, so the card ends on the sum instead of empty space. */}
          <p className="mt-auto flex items-baseline justify-between gap-3 border-t border-border/60 pt-3 text-sm">
            <span className="text-muted-foreground">
              Total · {totalOrders} {totalOrders === 1 ? "venda" : "vendas"}
            </span>
            <span className="font-semibold tabular-nums">{formatCents(totalRevenue)}</span>
          </p>
        </>
      )}
    </BreakdownSection>
  );
}

export function TopProducts({ products }: { products: ProductRow[] }) {
  return (
    <BreakdownSection
      title="Produtos mais vendidos"
      to="/publicacoes"
      hint="Ver todas as suas publicações"
    >
      {products.length === 0 ? (
        <EmptyRows />
      ) : (
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="w-7 pb-2 font-normal">
                <span className="sr-only">Posição</span>
              </th>
              <th scope="col" className="pb-2 font-normal">
                Produto
              </th>
              <th scope="col" className="w-20 pb-2 text-right font-normal max-sm:hidden">
                Unidades
              </th>
              <th scope="col" className="w-24 pb-2 text-right font-normal">
                Receita
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {products.map((product, index) => (
              <tr key={product.title}>
                <td className="py-3 text-xs text-muted-foreground tabular-nums">{index + 1}</td>
                <td className="py-3 pr-3" title={product.title}>
                  {/* Two lines instead of one: names like "Fone bluetooth TWS com estojo - Verde" stay whole. */}
                  <span className="line-clamp-2 wrap-anywhere">{product.title}</span>
                </td>
                <td className="py-3 pl-2 text-right text-muted-foreground tabular-nums max-sm:hidden">
                  {product.units}
                </td>
                <td className="py-3 pl-2 text-right font-medium whitespace-nowrap tabular-nums">
                  {formatCents(product.revenueCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </BreakdownSection>
  );
}
