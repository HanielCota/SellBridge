import { formatCents } from "@sellbridge/shared/money";
import { ProductVisual } from "@/components/catalog/product-visual";
import { MarketplaceMark } from "@/components/stores/marketplace-mark";
import { profitMargin } from "@/features/reports/dashboard-insights";
import { BreakdownSection } from "@/components/reports/breakdown-section";
import { formatPercent } from "@/lib/percent";

interface StoreRow {
  storeConnectionId: string;
  storeName: string;
  marketplace: string;
  orders: number;
  revenueCents: number;
  profitCents: number;
  pendingCostRevenueCents: number;
}

interface ProductRow {
  title: string;
  units: number;
  revenueCents: number;
  imageUrl: string | null;
  categoryName: string | null;
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

/**
 * Hovering one row of a breakdown fades the others, so the row under the pointer stands out like
 * the hovered bar of a chart.
 */
const HOVER_LIST =
  "[&:has(>li:hover)>li:not(:hover)]:opacity-45 [&>li]:transition-opacity [&>li]:duration-150";

/** A horizontal bar of a breakdown, in the revenue's blue, at least a sliver when above zero. */
function ShareBar({ share }: { share: number }) {
  return (
    <div className="h-2 flex-1 rounded-full bg-muted" aria-hidden="true">
      <div
        className="h-full rounded-full bg-chart-revenue"
        style={{ width: `${Math.max(2, Math.round(share * 100))}%` }}
      />
    </div>
  );
}

function StoreShare({ store, totalRevenue }: { store: StoreRow; totalRevenue: number }) {
  const share = totalRevenue > 0 ? store.revenueCents / totalRevenue : 0;
  const name = store.storeName;
  return (
    <li className="flex gap-3">
      <MarketplaceMark marketplace={store.marketplace} className="size-9 rounded-lg" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="truncate font-medium" title={name}>
            {name}
          </span>
          <span className="shrink-0 font-medium tabular-nums">
            {formatCents(store.revenueCents)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <ShareBar share={share} />
          <span className="w-10 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
            {formatPercent(share)}
            <span className="sr-only"> da receita</span>
          </span>
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {store.orders} {store.orders === 1 ? "venda" : "vendas"} · lucro{" "}
          {formatCents(store.profitCents)} · {marginText(store)}
        </p>
      </div>
    </li>
  );
}

/** Each store's share of revenue, with its marketplace logo; orders, profit and margin below. */
export function StoreBreakdown({ stores }: { stores: StoreRow[] }) {
  const totalRevenue = stores.reduce((sum, store) => sum + store.revenueCents, 0);
  const totalOrders = stores.reduce((sum, store) => sum + store.orders, 0);
  return (
    <BreakdownSection title="Vendas por loja" to="/lojas" hint="Ver todas as suas lojas">
      {stores.length === 0 ? (
        <EmptyRows />
      ) : (
        <>
          <ul className={`space-y-5 ${HOVER_LIST}`}>
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

const unitCount = new Intl.NumberFormat("pt-BR");

function ProductBar({ product, topRevenue }: { product: ProductRow; topRevenue: number }) {
  const share = topRevenue > 0 ? product.revenueCents / topRevenue : 0;
  return (
    <li className="flex gap-3">
      <span className="size-11 shrink-0 overflow-hidden rounded-xl">
        <ProductVisual
          imageUrl={product.imageUrl}
          title={product.title}
          categoryName={product.categoryName}
          compact
          className="size-full"
        />
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start justify-between gap-3 text-sm">
          {/* Two lines instead of one: names like "Fone bluetooth TWS com estojo - Verde" stay whole. */}
          <span className="line-clamp-2 wrap-anywhere" title={product.title}>
            {product.title}
          </span>
          <span className="shrink-0 font-medium whitespace-nowrap tabular-nums">
            {formatCents(product.revenueCents)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <ShareBar share={share} />
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {unitCount.format(product.units)} {product.units === 1 ? "unidade" : "unidades"}
          </span>
        </div>
      </div>
    </li>
  );
}

/** Best sellers by revenue, with the product photo; each bar is measured against the first. */
export function TopProducts({ products }: { products: ProductRow[] }) {
  const topRevenue = Math.max(0, ...products.map((product) => product.revenueCents));
  return (
    <BreakdownSection
      title="Produtos mais vendidos"
      to="/publicacoes"
      hint="Ver todas as suas publicações"
    >
      {products.length === 0 ? (
        <EmptyRows />
      ) : (
        <ol className={`space-y-4 ${HOVER_LIST}`}>
          {products.map((product) => (
            <ProductBar key={product.title} product={product} topRevenue={topRevenue} />
          ))}
        </ol>
      )}
    </BreakdownSection>
  );
}
