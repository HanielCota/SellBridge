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
import { useTabProfileLink } from "@/lib/tab-profile";
import { useNow } from "@/hooks/use-now";
import { isBatchSelectable } from "../orders/order-row-parts";
import { ShipmentPanelDialog } from "../orders/shipment-panel-dialog";
import { HomeCatalogRow } from "./home-catalog-rows";
import { HomeHealthSection } from "./home-health-section";
import { HomeListGroup } from "./home-list";
import { HomeOrderRow } from "./home-order-rows";
import { catalogNote, lateCount, lateNote } from "./home-queue-summary";
import { HomeSummary, type HomeSummaryItem } from "./home-summary";

type HrefFor = (target: SupplierAttentionTarget) => string;

const GROUP_ANCHORS = {
  accept: "grupo-aceitar",
  progress: "grupo-despachar",
  catalog: "grupo-catalogo",
} as const;

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
  const profileLink = useTabProfileLink();
  return (
    <EmptyState
      icon={CheckCircleIcon}
      title="Nada esperando por você"
      description="Pedidos novos aparecem aqui com o prazo de aceite, e produtos para ajustar logo abaixo."
      action={
        <Button size="sm" variant="outline" asChild>
          <a href={profileLink(`${SUPPLIER_PANEL_BASE_PATH}/pedidos`)}>Ver pedidos</a>
        </Button>
      }
    />
  );
}

/** Rows of one order group, sharing the open row, the clock and the writes. */
interface OrderGroupProps {
  id: string;
  title: string;
  hint: string;
  rows: readonly SupplierHomeOrderRow[];
  total: number;
  now: Date;
  href: string;
  acceptAll?: { pending: boolean; onAccept: () => void };
  rowProps: (row: SupplierHomeOrderRow) => Parameters<typeof HomeOrderRow>[0];
}

function OrderGroup({
  id,
  title,
  hint,
  rows,
  total,
  now,
  href,
  acceptAll,
  rowProps,
}: OrderGroupProps) {
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
      id={id}
      title={title}
      total={total}
      hint={hint}
      late={lateNote({ late: lateCount(rows, now), loaded: rows.length, total })}
      action={
        batch === null ? null : (
          <Button size="sm" variant="outline" disabled={batch.pending} onClick={batch.onAccept}>
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
  hrefFor,
}: {
  fixes: SupplierHomeData["catalog"];
  hrefFor: HrefFor;
}) {
  if (fixes.length === 0) {
    return null;
  }
  return (
    <HomeListGroup id={GROUP_ANCHORS.catalog} title="Ajustar no catálogo" total={fixes.length}>
      {fixes.map((fix) => (
        <HomeCatalogRow key={fix.productId} fix={fix} hrefFor={hrefFor} />
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
  return { now, actions, opened, setOpened, rowProps };
}

/** The three counts on top of the list, read from the same rows the groups show. */
function summaryItems(data: SupplierHomeData, now: Date): HomeSummaryItem[] {
  const { accept, progress } = data.orders;
  const { orderTotals } = data;
  const orderItem = (
    anchor: string,
    label: string,
    rows: readonly SupplierHomeOrderRow[],
    total: number,
  ): HomeSummaryItem => {
    const note = lateNote({ late: lateCount(rows, now), loaded: rows.length, total });
    return {
      anchor: total === 0 ? null : anchor,
      count: total,
      label,
      note: note ?? "Nenhum atrasado",
      pressing: note !== null,
    };
  };
  return [
    orderItem(GROUP_ANCHORS.accept, "Para aceitar", accept, orderTotals.accept),
    orderItem(GROUP_ANCHORS.progress, "Para despachar", progress, orderTotals.progress),
    {
      anchor: data.catalog.length === 0 ? null : GROUP_ANCHORS.catalog,
      count: data.catalog.length,
      label: "No catálogo",
      note: catalogNote(data.catalog),
      pressing: false,
    },
  ];
}

interface HomeQueueProps {
  supplierId: string;
  data: SupplierHomeData;
  hrefFor: HrefFor;
  active: boolean;
}

/**
 * The home's one card: the account's health first, then the counts, then accept, the parcels
 * under way and the catalog fixes, all in view at once. A row opens in place with its photo and
 * its action; "Ver pedido" opens the same panel as the Pedidos page.
 */
export function HomeQueue({ supplierId, data, hrefFor, active }: HomeQueueProps) {
  const { now, actions, opened, setOpened, rowProps } = useHomeQueueState(supplierId);
  const profileLink = useTabProfileLink();
  const { accept, progress } = data.orders;
  const { orderTotals } = data;
  const empty = orderTotals.accept + orderTotals.progress === 0 && data.catalog.length === 0;
  return (
    <div className="space-y-4">
      <div className="surface-card overflow-hidden rounded-2xl bg-card pb-1.5">
        <HomeHealthSection
          supplierId={supplierId}
          health={data.health}
          performanceHref={profileLink(`${SUPPLIER_PANEL_BASE_PATH}/desempenho`)}
          active={active}
          highlighted={data.highlighted}
        />
        {empty ? null : (
          <>
            <HomeSummary items={summaryItems(data, now)} />
            <OrderGroup
              id={GROUP_ANCHORS.accept}
              title="Aceitar"
              hint="Confirme se você tem o produto para vender. Pedido sem aceite no prazo vira flag."
              rows={accept}
              total={orderTotals.accept}
              now={now}
              href={hrefFor({ area: "orders", filter: "accept_soon" })}
              acceptAll={{
                pending: actions.batchPending,
                onAccept: () => actions.acceptAll(accept),
              }}
              rowProps={rowProps}
            />
            <OrderGroup
              id={GROUP_ANCHORS.progress}
              title="Separar e despachar"
              hint="Embale e poste dentro do prazo de despacho de cada pedido."
              rows={progress}
              total={orderTotals.progress}
              now={now}
              href={hrefFor({ area: "orders", filter: "dispatch_soon" })}
              rowProps={rowProps}
            />
            <CatalogGroup fixes={data.catalog} hrefFor={hrefFor} />
          </>
        )}
      </div>
      {empty ? <AllClear /> : null}
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

/** The same card, health band and rows as the loaded list, so nothing jumps when it arrives. */
export function HomeQueueSkeleton() {
  return (
    <output className="block" aria-busy="true" aria-label="Carregando o Início">
      <div className="surface-card rounded-2xl bg-card pb-3">
        <div className="space-y-3 border-b border-border px-5 py-4.5">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-7 w-2/3" />
        </div>
        <div className="px-5 pt-4">
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
      </div>
    </output>
  );
}
