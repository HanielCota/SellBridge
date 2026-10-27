import type { SupplierAttentionTarget } from "@sellbridge/shared/supplier-panel-attention";
import { useQuery } from "@tanstack/react-query";
import { ErrorState } from "@/components/feedback/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPeriodCaption } from "@/features/reports/dashboard-metrics";
import type { SupplierHomeData } from "@/features/supplier-panel/home/home-types";
import { supplierHomeQueryOptions } from "@/features/supplier-panel/home/home.queries";
import type { SupplierSalesSearch } from "@/features/supplier-panel/sales/sales-search";
import {
  supplierSalesQueryOptions,
  type SupplierSalesData,
} from "@/features/supplier-panel/sales/sales.queries";
import { errorMessage } from "@/lib/errors";
import { useTabProfileLink } from "@/lib/tab-profile";
import { cn } from "@/lib/utils";
import { SupplierAttentionPanel } from "../sales/supplier-attention-panel";
import { SupplierFirstSteps } from "../sales/supplier-first-steps";
import { SupplierKpiTiles } from "../sales/supplier-kpi-tiles";
import { SupplierPeriodSummary } from "../sales/supplier-period-summary";
import { ParcelStagesCard, SupplierTopProducts } from "../sales/supplier-sales-cards";
import { SupplierSalesChart } from "../sales/supplier-sales-chart";
import { SupplierSalesFilters } from "../sales/supplier-sales-filters";

type HrefFor = (target: SupplierAttentionTarget) => string;

interface SupplierHomeProps {
  supplierId: string;
  search: SupplierSalesSearch;
  onSearchChange: (patch: Partial<SupplierSalesSearch>) => void;
  hrefFor: HrefFor;
}

function HomeSkeleton() {
  // Same sizes as the loaded layout, so nothing jumps when the data arrives.
  return (
    <output className="block space-y-6" aria-busy="true" aria-label="Carregando o Início">
      <div className="space-y-2">
        <Skeleton className="h-4 w-72 max-w-full" />
        <Skeleton className="h-6 w-full max-w-2xl" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-36 rounded-3xl" />
          ))}
        </div>
        <Skeleton className="h-[426px] rounded-3xl xl:h-auto" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-80 rounded-3xl" />
        ))}
      </div>
    </output>
  );
}

interface ContentProps extends SupplierHomeProps {
  data: SupplierSalesData;
  home: SupplierHomeData | undefined;
}

/** Before the first sale: the first steps, and whatever already needs the supplier. */
function FirstSteps({ data, home, hrefFor }: ContentProps) {
  return (
    <>
      <SupplierFirstSteps setup={data.setup} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SupplierAttentionPanel home={home} runningOut={data.runningOut} hrefFor={hrefFor} />
      </div>
    </>
  );
}

function SalesOverview({ data, home, supplierId, search, onSearchChange, hrefFor }: ContentProps) {
  const profileLink = useTabProfileLink();
  const exportSearch = new URLSearchParams({ supplierId, ...exportParams(search) });
  return (
    <>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{formatPeriodCaption(data.period)}</p>
        <SupplierPeriodSummary
          current={data.summary}
          previous={data.previous}
          points={data.timeseries}
          bucket={data.period.bucket}
          fromDate={data.period.fromDate}
          situation={search.situation}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <SupplierKpiTiles
          summary={data.summary}
          previous={data.previous}
          points={data.timeseries}
          situation={search.situation}
        />
        <SupplierSalesChart
          data={data}
          situation={search.situation}
          exportUrl={profileLink(`/api/fornecedor/vendas/exportar?${exportSearch.toString()}`)}
          filters={<SupplierSalesFilters data={data} search={search} onChange={onSearchChange} />}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ParcelStagesCard stages={data.parcelStages} />
        <SupplierTopProducts products={data.topProducts} />
        <SupplierAttentionPanel home={home} runningOut={data.runningOut} hrefFor={hrefFor} />
      </div>
    </>
  );
}

/** The search as plain text pairs for the export link, without the empty filters. */
function exportParams(search: SupplierSalesSearch): Record<string, string> {
  return Object.fromEntries(
    Object.entries(search).flatMap(([key, value]) => (value === undefined ? [] : [[key, value]])),
  );
}

/**
 * The supplier's "Início" (item 38): the reseller's sales dashboard with the supplier's numbers
 * (what it receives, pieces, best sellers and where the parcels are) and what needs it now.
 */
export function SupplierSalesOverview(props: SupplierHomeProps) {
  const sales = useQuery(supplierSalesQueryOptions(props.supplierId, props.search));
  const home = useQuery(supplierHomeQueryOptions(props.supplierId));
  // A failed background refresh keeps the numbers already on screen.
  if (sales.isError && sales.data === undefined) {
    return (
      <div className="space-y-6">
        <ErrorState message={errorMessage(sales.error)} onRetry={() => void sales.refetch()} />
      </div>
    );
  }
  if (sales.data === undefined) {
    return (
      <div className="space-y-6">
        <HomeSkeleton />
      </div>
    );
  }
  const content = { ...props, data: sales.data, home: home.data };
  return (
    <div
      aria-busy={sales.isPlaceholderData}
      className={cn("space-y-6 transition-opacity", sales.isPlaceholderData && "opacity-60")}
    >
      {sales.data.setup.hasSales ? <SalesOverview {...content} /> : <FirstSteps {...content} />}
    </div>
  );
}
