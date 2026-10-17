import type { SupplierAttentionTarget } from "@sellbridge/shared/supplier-panel-attention";
import { HEALTH_WINDOW_DAYS } from "@sellbridge/shared/supplier-panel-health";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { supplierHomeQueryOptions } from "@/features/supplier-panel/home/home.queries";
import { AttentionQueue } from "./attention-queue";
import { HealthTiles, HealthTilesSkeleton } from "./health-tiles";

interface SupplierHomeProps {
  supplierId: string;
  hrefFor: (target: SupplierAttentionTarget) => string;
}

function HomeGrid({ queue, tiles }: { queue: ReactNode; tiles: ReactNode }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {queue}
      <section aria-label="Saúde da conta" className="min-w-0 space-y-3">
        <p className="text-footnote text-muted-foreground">
          Saúde da conta · últimos {HEALTH_WINDOW_DAYS} dias
        </p>
        {tiles}
      </section>
    </div>
  );
}

/**
 * "Início" of the supplier panel, task queue first (Vendor Central, Mercado Livre): what needs
 * the supplier on the left, the four health numbers with their targets on the right.
 */
export function SupplierHome({ supplierId, hrefFor }: SupplierHomeProps) {
  const query = useQuery(supplierHomeQueryOptions(supplierId));
  const header = (
    <PageHeader
      title="Início"
      description={
        query.data === undefined
          ? "O que precisa de você hoje e como está a sua conta."
          : `${query.data.supplierName} · o que precisa de você hoje e como está a sua conta.`
      }
    />
  );
  // A failed background refresh keeps the numbers already on screen.
  if (query.isError && query.data === undefined) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorState
          message="Não foi possível carregar o início do painel."
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }
  if (query.data === undefined) {
    return (
      <div className="space-y-6">
        {header}
        <HomeGrid
          queue={<Skeleton className="h-80 rounded-3xl" aria-label="Carregando pendências" />}
          tiles={<HealthTilesSkeleton />}
        />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {header}
      <HomeGrid
        queue={<AttentionQueue items={query.data.attention} hrefFor={hrefFor} />}
        tiles={
          <HealthTiles
            metrics={query.data.health.metrics}
            hrefFor={(metric) => hrefFor({ area: "performance", metric })}
          />
        }
      />
    </div>
  );
}
