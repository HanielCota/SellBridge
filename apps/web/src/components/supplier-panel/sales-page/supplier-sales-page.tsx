import { resolveReportPeriod } from "@sellbridge/shared/report-period";
import type { ReportPeriodSearch } from "@sellbridge/shared/schemas";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { PeriodControls } from "@/components/report-kit/period-controls";
import { Skeleton } from "@/components/ui/skeleton";
import {
  supplierSalesPageQueryOptions,
  type SupplierSalesPageData,
} from "@/features/supplier-panel/sales-page/sales-page.queries";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { SupplierDownloadMenu } from "../report/supplier-download-menu";
import { SupplierKpiTiles } from "../sales/supplier-kpi-tiles";
import { BestSellersCard, ChannelsCard, IdleCard, SoldOutCard } from "./sales-page-cards";
import { SalesOrdersChart } from "./sales-orders-chart";

interface SupplierSalesPageProps {
  supplierId: string;
  search: ReportPeriodSearch;
  onPeriodChange: (search: ReportPeriodSearch) => void;
}

function SalesSkeleton() {
  // Same blocks as the loaded page, so nothing jumps when the data arrives.
  return (
    <output className="block space-y-4" aria-busy="true" aria-label="Carregando vendas">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-36 rounded-3xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-3xl" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-3xl" />
        <Skeleton className="h-72 rounded-3xl" />
      </div>
    </output>
  );
}

function SalesContent({ data }: { data: SupplierSalesPageData }) {
  return (
    <>
      <SupplierKpiTiles
        summary={data.summary}
        previous={data.previous}
        points={data.series}
        situation="sold"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      />
      <SalesOrdersChart data={data} />
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
        <ChannelsCard data={data} />
        <BestSellersCard data={data} />
        <SoldOutCard data={data} />
        <IdleCard data={data} />
      </div>
    </>
  );
}

/**
 * "Vendas" of the supplier panel: what sold in a month or a range, by day and by marketplace,
 * the best sellers, and the products to restock or that stopped selling. The period is picked
 * with the report's month stepper and calendar, so both pages read the same way.
 */
export function SupplierSalesPage({ supplierId, search, onPeriodChange }: SupplierSalesPageProps) {
  // The clock of the page's first render: "today" for a partial month and the future-month cap.
  const [now] = useState(() => new Date());
  const period = useMemo(() => resolveReportPeriod(search, now), [search, now]);
  const query = useQuery(supplierSalesPageQueryOptions(supplierId, search));
  const header = (
    <PageHeader
      title="Vendas"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <PeriodControls period={period} onChange={onPeriodChange} />
          <SupplierDownloadMenu period={period} />
        </div>
      }
    />
  );
  // A failed background refresh keeps the numbers already on screen.
  if (query.isError && query.data === undefined) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {header}
      {query.data === undefined ? (
        <SalesSkeleton />
      ) : (
        <div
          aria-busy={query.isPlaceholderData}
          className={cn("space-y-4 transition-opacity", query.isPlaceholderData && "opacity-60")}
        >
          <SalesContent data={query.data} />
        </div>
      )}
    </div>
  );
}
