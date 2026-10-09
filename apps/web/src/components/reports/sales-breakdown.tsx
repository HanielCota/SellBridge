import { formatCents } from "@sellbridge/shared/money";
import { ArrowsOutSimpleIcon } from "@phosphor-icons/react";
import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";

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
  return (
    <section className="h-full rounded-3xl bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-medium text-muted-foreground">{title}</h2>
        <Link
          to={to}
          aria-label={`Abrir ${title.toLowerCase()}`}
          className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowsOutSimpleIcon className="size-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function EmptyRows() {
  return (
    <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma venda no período.</p>
  );
}

/** Each store's share of revenue, with orders, profit and margin as secondary facts. */
export function StoreBreakdown({ stores }: { stores: StoreRow[] }) {
  const totalRevenue = stores.reduce((sum, store) => sum + store.revenueCents, 0);
  return (
    <BreakdownSection title="Vendas por loja" to="/lojas">
      {stores.length === 0 ? (
        <EmptyRows />
      ) : (
        <ul className="space-y-5">
          {stores.map((store) => {
            const share = totalRevenue > 0 ? store.revenueCents / totalRevenue : 0;
            const margin = store.revenueCents > 0 ? store.profitCents / store.revenueCents : 0;
            return (
              <li key={store.storeConnectionId} className="space-y-2">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate">{store.storeName}</span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {formatCents(store.revenueCents)}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-chart-brand"
                    style={{ width: `${Math.max(2, Math.round(share * 100))}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {percent.format(share)} da receita · {store.orders} vendas · lucro{" "}
                  {formatCents(store.profitCents)} ({percent.format(margin)} de margem)
                </p>
              </li>
            );
          })}
        </ul>
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
              <th scope="col" className="w-14 pb-2 text-right font-normal max-sm:hidden">
                Unid.
              </th>
              <th scope="col" className="w-28 pb-2 text-right font-normal">
                Receita
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {products.map((product, index) => (
              <tr key={product.title}>
                <td className="py-2.5 text-xs text-muted-foreground tabular-nums">{index + 1}</td>
                <td className="py-2.5 pr-3" title={product.title}>
                  <span className="line-clamp-2 sm:line-clamp-1">{product.title}</span>
                </td>
                <td className="py-2.5 pl-2 text-right text-muted-foreground tabular-nums max-sm:hidden">
                  {product.units}
                </td>
                <td className="py-2.5 pl-4 text-right font-medium whitespace-nowrap tabular-nums">
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
