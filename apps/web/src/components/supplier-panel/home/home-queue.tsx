import type { SupplierAttentionTarget } from "@sellbridge/shared/supplier-panel-attention";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SUPPLIER_PANEL_BASE_PATH } from "@/features/supplier-panel/home/attention-links";
import type {
  SupplierHomeData,
  SupplierHomeOrderRow,
} from "@/features/supplier-panel/home/home-types";
import { useHomeActions } from "@/features/supplier-panel/home/use-home-actions";
import { useNow } from "@/hooks/use-now";
import { isBatchSelectable } from "../orders/order-row-parts";
import { ShipmentPanelDialog } from "../orders/shipment-panel-dialog";
import { HealthStrip } from "./health-strip";
import { HomeCatalogRow } from "./home-catalog-rows";
import { HomeListGroup } from "./home-list";
import { HomeOrderRow } from "./home-order-rows";

type HrefFor = (target: SupplierAttentionTarget) => string;

function SeeAll({ total, href }: { total: number; href: string }) {
  return (
    <a
      href={href}
      className="block border-t border-border/60 px-5 py-3 text-footnote font-medium text-brand-text outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
    >
      Ver todos os {total}
    </a>
  );
}

function AllClear() {
  return (
    <EmptyState
      icon={CheckCircleIcon}
      title="Nada esperando por você"
      description="Pedidos novos aparecem aqui com o prazo de aceite, e produtos para ajustar logo abaixo."
      action={
        <Button size="sm" variant="outline" asChild>
          <a href={`${SUPPLIER_PANEL_BASE_PATH}/pedidos`}>Ver pedidos</a>
        </Button>
      }
    />
  );
}

/** Rows of one order group, sharing the open row, the clock and the writes. */
interface OrderGroupProps {
  title: string;
  rows: readonly SupplierHomeOrderRow[];
  total: number;
  href: string;
  acceptAll?: { pending: boolean; onAccept: () => void };
  rowProps: (row: SupplierHomeOrderRow) => Parameters<typeof HomeOrderRow>[0];
}

function OrderGroup({ title, rows, total, href, acceptAll, rowProps }: OrderGroupProps) {
  // A group past the first page of the queue still shows, with only its "Ver todos" link.
  if (total === 0) {
    return null;
  }
  // The batch only covers what the list shows, so it is offered when the list shows them all.
  const batchable = rows.filter((row) => isBatchSelectable(row)).length;
  const batch =
    acceptAll !== undefined && total === rows.length && batchable > 1 ? acceptAll : null;
  return (
    <HomeListGroup
      title={title}
      total={total}
      action={
        batch === null ? null : (
          <Button size="sm" variant="ghost" disabled={batch.pending} onClick={batch.onAccept}>
            {batch.pending ? "Aceitando…" : "Aceitar todos"}
          </Button>
        )
      }
      footer={total > rows.length ? <SeeAll total={total} href={href} /> : null}
    >
      {rows.map((row) => (
        <HomeOrderRow key={row.id} {...rowProps(row)} />
      ))}
    </HomeListGroup>
  );
}

function CatalogGroup({
  fixes,
  expandedId,
  onToggle,
  hrefFor,
}: {
  fixes: SupplierHomeData["catalog"];
  expandedId: string | null;
  onToggle: (id: string) => void;
  hrefFor: HrefFor;
}) {
  if (fixes.length === 0) {
    return null;
  }
  return (
    <HomeListGroup title="Ajustar no catálogo" total={fixes.length}>
      {fixes.map((fix) => (
        <HomeCatalogRow
          key={fix.productId}
          fix={fix}
          expanded={expandedId === fix.productId}
          onToggle={() => onToggle(fix.productId)}
          hrefFor={hrefFor}
        />
      ))}
    </HomeListGroup>
  );
}

/** The open row, the opened parcel, the clock and the writes every row shares. */
function useHomeQueueState(supplierId: string) {
  const now = useNow();
  const actions = useHomeActions(supplierId);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [opened, setOpened] = useState<{ id: string; externalOrderId: string } | null>(null);
  const toggle = (id: string) => setExpandedId((current) => (current === id ? null : id));
  const rowProps = (row: SupplierHomeOrderRow) => ({
    row,
    now,
    expanded: expandedId === row.id,
    pending: actions.pendingId === row.id,
    onToggle: () => toggle(row.id),
    onAdvance: actions.advanceRow,
    onOpen: (target: SupplierHomeOrderRow) =>
      setOpened({ id: target.id, externalOrderId: target.externalOrderId }),
  });
  return { actions, expandedId, toggle, opened, setOpened, rowProps };
}

/**
 * The single list of the home: accept, then the parcels under way, then the catalog fixes, all
 * in view at once; the health sits in one line under it. A row opens in place with its photo
 * and its one action; "Ver pedido" opens the same panel as the Pedidos page.
 */
export function HomeQueue({
  supplierId,
  data,
  hrefFor,
}: {
  supplierId: string;
  data: SupplierHomeData;
  hrefFor: HrefFor;
}) {
  const { actions, expandedId, toggle, opened, setOpened, rowProps } =
    useHomeQueueState(supplierId);
  const { accept, progress } = data.orders;
  const { orderTotals } = data;
  const empty = orderTotals.accept + orderTotals.progress === 0 && data.catalog.length === 0;
  return (
    <div className="space-y-4">
      {empty ? (
        <AllClear />
      ) : (
        <div className="surface-card overflow-hidden rounded-3xl bg-card pb-1.5">
          <OrderGroup
            title="Aceitar"
            rows={accept}
            total={data.orderTotals.accept}
            href={hrefFor({ area: "orders", filter: "accept_soon" })}
            acceptAll={{ pending: actions.batchPending, onAccept: () => actions.acceptAll(accept) }}
            rowProps={rowProps}
          />
          <OrderGroup
            title="Separar e despachar"
            rows={progress}
            total={data.orderTotals.progress}
            href={hrefFor({ area: "orders", filter: "dispatch_soon" })}
            rowProps={rowProps}
          />
          <CatalogGroup
            fixes={data.catalog}
            expandedId={expandedId}
            onToggle={toggle}
            hrefFor={hrefFor}
          />
        </div>
      )}
      <HealthStrip health={data.health} href={`${SUPPLIER_PANEL_BASE_PATH}/desempenho`} />
      <ShipmentPanelDialog
        supplierId={supplierId}
        opened={opened}
        onClose={() => {
          setOpened(null);
          void actions.refresh();
        }}
      />
    </div>
  );
}

const SKELETON_ROWS = ["first", "second", "third", "fourth"] as const;

/** The same card, rows and strip as the loaded list, so nothing jumps when it arrives. */
export function HomeQueueSkeleton() {
  return (
    <output className="block space-y-4" aria-busy="true" aria-label="Carregando o Início">
      <div className="surface-card rounded-3xl bg-card px-5 pt-4 pb-3">
        <Skeleton className="mb-3 h-5 w-24" />
        {SKELETON_ROWS.map((key) => (
          <div key={key} className="flex items-center gap-3.5 py-2.5">
            <Skeleton className="size-13 rounded-xl" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3.5 w-2/3" />
            </div>
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
      <Skeleton className="h-4 w-3/4" />
    </output>
  );
}
