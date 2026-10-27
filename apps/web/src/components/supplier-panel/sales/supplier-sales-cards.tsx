import { formatCents } from "@sellbridge/shared/money";
import {
  SUPPLIER_PARCEL_STAGE_LABELS,
  SUPPLIER_PARCEL_STAGES,
  type SupplierParcelStageCounts,
} from "@sellbridge/shared/supplier-panel-sales";
import { ToneStatus } from "@/components/data/tone-status";
import { BreakdownSection } from "@/components/reports/breakdown-section";
import type { SupplierSalesData } from "@/features/supplier-panel/sales/sales.queries";
import { stockForecast } from "@/features/supplier-panel/sales/stock-forecast";
import { HomePhoto } from "../home/home-photo";

const count = new Intl.NumberFormat("pt-BR");

function EmptyRows({ children }: { children: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

/**
 * Where the period's parcels are now, step by step (item 38). It takes the place of the
 * reseller's "Vendas por loja": the supplier sees the logistics, never the resellers' names.
 */
export function ParcelStagesCard({ stages }: { stages: SupplierParcelStageCounts }) {
  const total = SUPPLIER_PARCEL_STAGES.reduce((sum, stage) => sum + stages[stage], 0);
  return (
    <BreakdownSection
      title="Seus pedidos"
      to="/fornecedor/painel/pedidos"
      hint="Ver todos os pedidos dos revendedores"
    >
      {total === 0 ? (
        <EmptyRows>Nenhum pedido no período.</EmptyRows>
      ) : (
        <ul className="divide-y text-sm">
          {SUPPLIER_PARCEL_STAGES.map((stage) => (
            <li key={stage} className="flex items-center justify-between gap-3 py-2.5">
              {stage === "accept" && stages.accept > 0 ? (
                <ToneStatus tone="warning" label={SUPPLIER_PARCEL_STAGE_LABELS.accept} />
              ) : (
                <span className="text-muted-foreground">{SUPPLIER_PARCEL_STAGE_LABELS[stage]}</span>
              )}
              <span className="font-medium tabular-nums">{count.format(stages[stage])}</span>
            </li>
          ))}
        </ul>
      )}
    </BreakdownSection>
  );
}

type TopProduct = SupplierSalesData["topProducts"][number];

function TopProductRow({ product }: { product: TopProduct }) {
  const forecast = stockForecast(product.daysLeft);
  return (
    <li className="flex items-center gap-3 py-2.5">
      <HomePhoto imageUrl={product.imageUrl} title={product.title} />
      <span className="min-w-0 flex-1 space-y-1">
        <span
          className="line-clamp-2 block text-sm font-medium wrap-anywhere"
          title={product.title}
        >
          {product.title}
        </span>
        {/* No legend here: the card is one big link, so the row holds nothing else to focus. */}
        <ToneStatus tone={forecast.tone} label={forecast.label} />
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-medium tabular-nums">
          {count.format(product.units)} {product.units === 1 ? "peça" : "peças"}
        </span>
        <span className="block text-xs text-muted-foreground tabular-nums">
          {formatCents(product.receivableCents)}
        </span>
      </span>
    </li>
  );
}

/** The best sellers with their photo and how long their stock lasts at the period's pace. */
export function SupplierTopProducts({ products }: { products: readonly TopProduct[] }) {
  return (
    <BreakdownSection
      title="Mais vendidos"
      to="/fornecedor/painel/produtos"
      hint="Ver todos os seus produtos"
    >
      {products.length === 0 ? (
        <EmptyRows>Nenhuma venda no período.</EmptyRows>
      ) : (
        <ol className="-my-2.5 divide-y" aria-label="Produtos mais vendidos no período">
          {products.map((product) => (
            <TopProductRow key={product.productId} product={product} />
          ))}
        </ol>
      )}
    </BreakdownSection>
  );
}
