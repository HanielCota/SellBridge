import { formatCents } from "@sellbridge/shared/money";
import { ArrowUpRightIcon } from "@phosphor-icons/react";
import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { displayStoreName } from "@/features/stores/store-name";

interface StoreRow {
  storeConnectionId: string;
  storeName: string;
  orders: number;
  revenueCents: number;
  profitCents: number;
}

interface ProductRow {
  title: string;
  units: number;
  revenueCents: number;
}

const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });

function BreakdownSection({
  title,
  to,
  children,
}: {
  title: string;
  to: NonNullable<LinkProps["to"]>;
  children: ReactNode;
}) {
  // The link's hit area is stretched over the whole card (`after:inset-0`), so a click anywhere
  // opens the full view while screen readers still hear one short link, not every row.
  return (
    <section className="group surface-interactive flex h-full flex-col rounded-3xl bg-card p-5 has-[a:focus-visible]:ring-[3px] has-[a:focus-visible]:ring-ring/50">
      <div className="-my-1 flex h-8 items-center justify-between gap-3">
        <h2 className="text-subhead font-medium text-muted-foreground transition-colors group-hover:text-foreground">
          {title}
        </h2>
        <Link
          to={to}
          aria-label={`Abrir ${title.toLowerCase()}`}
          className="-mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors group-hover:bg-foreground group-hover:text-background outline-none after:absolute after:inset-0"
        >
          <ArrowUpRightIcon className="size-3.5" weight="bold" aria-hidden="true" />
        </Link>
      </div>
      <div className="mt-5 flex flex-1 flex-col">{children}</div>
    </section>
  );
}

function EmptyRows() {
  return (
    <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma venda no período.</p>
  );
}

function StoreShare({ store, totalRevenue }: { store: StoreRow; totalRevenue: number }) {
  const share = totalRevenue > 0 ? store.revenueCents / totalRevenue : 0;
  const margin = store.revenueCents > 0 ? store.profitCents / store.revenueCents : 0;
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
          {percent.format(share)}
          <span className="sr-only"> da receita</span>
        </span>
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        {store.orders} {store.orders === 1 ? "venda" : "vendas"} · lucro{" "}
        {formatCents(store.profitCents)} · {percent.format(margin)} de margem
      </p>
    </li>
  );
}

/** Each store's share of revenue, with orders, profit and margin as secondary facts. */
export function StoreBreakdown({ stores }: { stores: StoreRow[] }) {
  const totalRevenue = stores.reduce((sum, store) => sum + store.revenueCents, 0);
  const totalOrders = stores.reduce((sum, store) => sum + store.orders, 0);
  return (
    <BreakdownSection title="Vendas por loja" to="/lojas">
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
    <BreakdownSection title="Produtos mais vendidos" to="/publicacoes">
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
              <th scope="col" className="w-12 pb-2 text-right font-normal max-sm:hidden">
                Unid.
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
                  <span className="line-clamp-2">{product.title}</span>
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
