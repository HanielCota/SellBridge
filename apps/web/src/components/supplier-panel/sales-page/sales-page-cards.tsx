import { formatCents } from "@sellbridge/shared/money";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { BreakdownSection } from "@/components/reports/breakdown-section";
import { MarketplaceMark } from "@/components/stores/marketplace-mark";
import { Button } from "@/components/ui/button";
import { HintedText } from "@/components/ui/hint";
import type { SupplierSalesPageData } from "@/features/supplier-panel/sales-page/sales-page.queries";
import { cn } from "@/lib/utils";
import { HomePhoto } from "../home/home-photo";

const count = new Intl.NumberFormat("pt-BR");

function piecesLabel(units: number): string {
  return `${count.format(units)} ${units === 1 ? "peça" : "peças"}`;
}

function EmptyRows({ children }: { children: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

/** Where the period's orders came from: each marketplace with its logo, share and orders. */
export function ChannelsCard({ data }: { data: SupplierSalesPageData }) {
  return (
    <BreakdownSection
      title="Onde você vendeu"
      to="/fornecedor/painel/pedidos"
      hint="Ver os pedidos dos revendedores"
    >
      {data.marketplaces.length === 0 ? (
        <EmptyRows>Nenhuma venda no período.</EmptyRows>
      ) : (
        <div className="flex flex-1 flex-col gap-4">
          <ul className="space-y-3">
            {data.marketplaces.map((share) => (
              <li key={share.marketplace} className="space-y-1.5">
                <div className="flex items-center gap-2.5 text-sm">
                  <MarketplaceMark
                    marketplace={share.marketplace}
                    className="size-5.5 rounded-md"
                  />
                  <span className="flex-1 font-medium">{share.name}</span>
                  <span className="font-semibold tabular-nums">{share.percent}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-foreground/70"
                    style={{ width: `${share.percent}%` }}
                  />
                </div>
                <p className="text-footnote text-muted-foreground tabular-nums">
                  {count.format(share.orders)} {share.orders === 1 ? "pedido" : "pedidos"} ·{" "}
                  {formatCents(share.receivableCents)}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-auto flex items-baseline justify-between gap-3 border-t border-border pt-3 text-sm">
            <HintedText
              label="Quantas lojas venderam pelo menos um produto seu no período"
              className="text-footnote text-muted-foreground hinted-term"
            >
              Lojas que venderam
            </HintedText>
            <span className="font-semibold tabular-nums">{count.format(data.stores)}</span>
          </p>
        </div>
      )}
    </BreakdownSection>
  );
}

type BestSort = "units" | "value";

/** The best sellers by pieces or by what the supplier receives, one tap apart. */
export function BestSellersCard({ data }: { data: SupplierSalesPageData }) {
  const [sort, setSort] = useState<BestSort>("units");
  const products = sort === "units" ? data.bestByUnits : data.bestByValue;
  return (
    <BreakdownSection
      title="Mais vendidos"
      to="/fornecedor/painel/produtos"
      hint="Ver todos os seus produtos"
      wholeCardLinks={false}
    >
      <div className="-mt-2 mb-3 flex w-fit gap-0.5 rounded-full bg-muted p-0.5">
        {(["units", "value"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={sort === option}
            onClick={() => setSort(option)}
            className={cn(
              "h-8 cursor-pointer rounded-full px-3 text-footnote font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
              sort === option ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            {option === "units" ? "Peças" : "Valor"}
          </button>
        ))}
      </div>
      {products.length === 0 ? (
        <EmptyRows>Nenhuma venda no período.</EmptyRows>
      ) : (
        <ol className="divide-y" aria-label="Produtos mais vendidos no período">
          {products.map((product) => (
            <li key={product.productId} className="flex items-center gap-3 py-2.5">
              <HomePhoto imageUrl={product.imageUrl} title={product.title} />
              <span className="line-clamp-2 min-w-0 flex-1 text-sm font-medium wrap-anywhere">
                {product.title}
              </span>
              <span className="shrink-0 text-right tabular-nums">
                <span className="block text-sm font-medium">
                  {sort === "units"
                    ? piecesLabel(product.units)
                    : formatCents(product.receivableCents)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {sort === "units"
                    ? formatCents(product.receivableCents)
                    : piecesLabel(product.units)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </BreakdownSection>
  );
}

/** Products that sold in the last 30 days and ran out: each with its stock field one tap away. */
export function SoldOutCard({ data }: { data: SupplierSalesPageData }) {
  return (
    <BreakdownSection
      title="Esgotados que vendiam"
      to="/fornecedor/painel/produtos"
      hint="Ver todos os seus produtos"
      wholeCardLinks={false}
    >
      {data.soldOut.length === 0 ? (
        <EmptyRows>Nada esgotado entre os que venderam nos últimos 30 dias.</EmptyRows>
      ) : (
        <ul className="divide-y">
          {data.soldOut.map((product) => (
            <li key={product.productId} className="flex items-center gap-3 py-2.5">
              <HomePhoto imageUrl={product.imageUrl} title={product.title} soldOut />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{product.title}</span>
                <span className="block text-footnote text-muted-foreground">
                  {piecesLabel(product.units)} em 30 dias
                </span>
              </span>
              <Button size="sm" asChild>
                <Link
                  to="/fornecedor/painel/produtos"
                  search={{ product: product.productId, field: "stock" }}
                >
                  Atualizar estoque
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </BreakdownSection>
  );
}

/** Products on the shelf with no sale in 30 days, the most stock first. */
export function IdleCard({ data }: { data: SupplierSalesPageData }) {
  return (
    <BreakdownSection
      title="Sem venda há 30 dias"
      to="/fornecedor/painel/produtos"
      hint="Ver todos os seus produtos"
      wholeCardLinks={false}
    >
      {data.idle.length === 0 ? (
        <EmptyRows>Todos os produtos com estoque venderam nos últimos 30 dias.</EmptyRows>
      ) : (
        <ul className="divide-y">
          {data.idle.map((product) => (
            <li key={product.productId}>
              <Link
                to="/fornecedor/painel/produtos"
                search={{ product: product.productId }}
                className="flex items-center gap-3 rounded-xl py-2.5 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <HomePhoto imageUrl={product.imageUrl} title={product.title} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{product.title}</span>
                <span className="shrink-0 text-footnote text-muted-foreground tabular-nums">
                  {count.format(product.availableStock)} em estoque
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </BreakdownSection>
  );
}
