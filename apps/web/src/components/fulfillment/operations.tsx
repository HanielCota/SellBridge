import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { resolvePeriod } from "@sellbridge/shared/period-range";
import {
  FULFILLMENT_LABELS,
  FULFILLMENT_STATUSES,
  OPERATION_PERIODS,
  operationsSearchSchema,
  type OperationsUrlSearch,
} from "@sellbridge/shared/schemas";
import { PackageIcon } from "@phosphor-icons/react";
import type { z } from "zod";
import { PaginationBar } from "@/components/data/pagination-bar";
import { SearchInput } from "@/components/data/search-input";
import { SmartDate } from "@/components/data/smart-date";
import { TonePill } from "@/components/data/tone-status";
import { SHIPMENT_DELAY_LABELS } from "@sellbridge/shared/shipment-delay";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { OrderStatusBadge } from "@/components/reports/order-status-badge";
import { PeriodFilters } from "@/components/reports/period-filters";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { operationsQueryOptions } from "@/features/fulfillment/fulfillment.queries";
import {
  ORDER_TO_FORWARD_LABEL,
  shipmentsSummary,
  toForwardWords,
  waitsToBeForwarded,
} from "@/features/fulfillment/shipment-timeline";
import { attentionCountsQueryOptions } from "@/features/navigation/navigation.queries";
import { ordersToForwardTitle } from "@/components/reports/attention-items";
import { PaymentPill } from "@/components/supplier-payments/supplier-payment-badge";
import { displayBuyerName } from "@/features/orders/buyer-name";
import { orderItemsLabel } from "@/features/orders/order-items-label";
import { storesQueryOptions } from "@/features/stores/stores.queries";
import { useNow } from "@/hooks/use-now";
import { useUrlSearchQuery } from "@/hooks/use-url-search-query";
import { errorMessage } from "@/lib/errors";
import { FulfillmentDialog } from "./order-dialog";
import {
  ACTION_ICONS,
  CONTROL_HINTS,
  ORDER_STATUS_HINTS,
  SHIPMENT_DELAY_HINTS,
} from "@/components/icons/action-icons";
import { Hint, HintedText } from "@/components/ui/hint";

const OpenOrderIcon = ACTION_ICONS.openOrder.icon;
const OverdueIcon = ACTION_ICONS.overdue.icon;

type Search = z.infer<typeof operationsSearchSchema>;
type OperationRowData = Awaited<
  ReturnType<typeof import("@/features/fulfillment/fulfillment.functions").listOperationsFn>
>["items"][number];

const STAGE_OPTIONS: { value: Search["stage"]; label: string }[] = [
  { value: "all", label: "Todas as etapas" },
  { value: "unforwarded", label: ORDER_TO_FORWARD_LABEL },
  ...FULFILLMENT_STATUSES.map((status) => ({ value: status, label: FULFILLMENT_LABELS[status] })),
];

/** The list's query from the page address: what the server filters by. */
export function operationsQuery(search: OperationsUrlSearch): Search {
  return {
    query: search.opQuery ?? "",
    stage: search.stage,
    page: search.opPage,
    period: search.period,
    from: search.from,
    to: search.to,
    store: search.store,
  };
}

/** Orders to forward and follow, filtered from the page address (kept when coming back). */
export function Operations({
  search,
  onChange,
}: {
  search: OperationsUrlSearch;
  onChange: (patch: Partial<OperationsUrlSearch>) => void;
}) {
  const [opened, setOpened] = useState<OperationRowData | null>(null);
  const query = useQuery(operationsQueryOptions(operationsQuery(search)));
  return (
    <section className="space-y-4" aria-label="Pedidos para enviar">
      <OperationFilters search={search} onChange={onChange} />
      <OrdersToForwardStrip
        stage={search.stage}
        onShowThem={() => onChange({ stage: "unforwarded", opPage: 1 })}
      />
      {query.isPending ? (
        <Skeleton className="h-64 rounded-3xl" />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={PackageIcon}
          title="Nenhum pedido com esses filtros"
          description="Mude a busca, a etapa, o período ou a loja para ver outros."
        />
      ) : (
        <>
          <ul
            className="surface-card divide-y rounded-3xl bg-card px-5"
            aria-busy={query.isFetching}
          >
            {query.data.items.map((row) => (
              <OperationRow key={row.id} row={row} onOpen={setOpened} />
            ))}
          </ul>
          <PaginationBar
            page={query.data.page}
            totalPages={query.data.totalPages}
            total={query.data.total}
            itemLabel={{ one: "pedido", other: "pedidos" }}
            onPageChange={(opPage) => onChange({ opPage })}
          />
        </>
      )}
      <FulfillmentDialog order={opened} onClose={() => setOpened(null)} />
    </section>
  );
}

/**
 * Above the list while it shows other stages: how many paid orders wait for the reseller, and a
 * way to see only those.
 */
function OrdersToForwardStrip({
  stage,
  onShowThem,
}: {
  stage: Search["stage"];
  onShowThem: () => void;
}) {
  const counts = useQuery(attentionCountsQueryOptions());
  const waiting = counts.data?.ordersToForward ?? 0;
  if (waiting === 0 || stage === "unforwarded") {
    return null;
  }
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
        {ordersToForwardTitle(waiting)}
      </p>
      <Button variant="outline" className="w-full sm:w-auto" onClick={onShowThem}>
        Ver só esses
      </Button>
    </div>
  );
}

/** Where each order is in its parcels' life, in the design-system select. */
function StageSelect({
  stage,
  onStageChange,
}: {
  stage: Search["stage"];
  onStageChange: (stage: Search["stage"]) => void;
}) {
  return (
    <Select
      value={stage}
      onValueChange={(value) => onStageChange(operationsSearchSchema.shape.stage.parse(value))}
    >
      <Hint label={CONTROL_HINTS.orderStage} openOnTap={false}>
        <SelectTrigger
          className="w-full rounded-full sm:w-auto sm:min-w-52"
          aria-label="Etapa do envio"
        >
          <SelectValue>{STAGE_OPTIONS.find((option) => option.value === stage)?.label}</SelectValue>
        </SelectTrigger>
      </Hint>
      <SelectContent>
        {STAGE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Sale date and store, the same controls as the reports, with "Tudo" first. */
function OperationPeriodFilters({
  search,
  onChange,
}: {
  search: OperationsUrlSearch;
  onChange: (patch: Partial<OperationsUrlSearch>) => void;
}) {
  const stores = useQuery(storesQueryOptions());
  const now = useNow();
  // A custom range opens on the last 30 days; "Tudo" has no dates of its own.
  const shown = resolvePeriod(
    { period: search.period === "all" ? "30d" : search.period, from: search.from, to: search.to },
    now,
  );
  const storeOptions = (stores.data?.stores ?? []).map((store) => ({
    id: store.id,
    name: store.shopName,
  }));
  return (
    <PeriodFilters
      search={search}
      presets={OPERATION_PERIODS}
      stores={storeOptions}
      resolvedFrom={shown.fromDate}
      resolvedTo={shown.toDate}
      onChange={(patch) => onChange({ ...patch, opPage: 1 })}
    />
  );
}

/** Search as you type, stage, and the period and store controls. */
function OperationFilters({
  search,
  onChange,
}: {
  search: OperationsUrlSearch;
  onChange: (patch: Partial<OperationsUrlSearch>) => void;
}) {
  const { term, setTerm } = useUrlSearchQuery({
    urlQuery: search.opQuery,
    commitQuery: (opQuery) => onChange({ opQuery, opPage: 1 }),
  });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          label="Buscar por pedido ou comprador"
          placeholder="Pedido ou comprador"
          maxLength={100}
          value={term}
          onValueChange={setTerm}
          className="sm:max-w-sm sm:flex-1"
        />
        <StageSelect
          stage={search.stage}
          onStageChange={(stage) => onChange({ stage, opPage: 1 })}
        />
      </div>
      <OperationPeriodFilters search={search} onChange={onChange} />
    </div>
  );
}

function OperationRow({
  row,
  onOpen,
}: {
  row: OperationRowData;
  onOpen: (row: OperationRowData) => void;
}) {
  const toForward = waitsToBeForwarded(row);
  return (
    <li className="flex flex-wrap items-center gap-3 py-4">
      {/* At least 15rem for the order's text: on a phone, status and action wrap below it. */}
      <div className="min-w-0 flex-[1_1_15rem]">
        <p className="font-medium">
          <Link
            to="/pedidos/$orderId"
            params={{ orderId: row.id }}
            search={{ back: "operations" }}
            className="rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {row.externalOrderId}
          </Link>
        </p>
        <ItemsLine firstTitle={row.firstItemTitle} itemCount={row.itemCount} />
        <p className="text-xs text-muted-foreground">
          {displayBuyerName(row.buyerName)} · {row.storeName} · <SmartDate date={row.orderedAt} />
        </p>
        <ShipmentsLine row={row} />
      </div>
      <div className="flex flex-col items-start gap-1">
        {toForward ? (
          <PaymentPill tone="warning">{toForwardWords(row.ownItemsOnly).badge}</PaymentPill>
        ) : (
          <HintedText label={ORDER_STATUS_HINTS[row.status] ?? "Situação do pedido"}>
            <OrderStatusBadge status={row.status} />
          </HintedText>
        )}
        {row.stockShort ? <TonePill tone="warning" label="Falta estoque" /> : null}
        {row.openClaim ? <TonePill tone="danger" label="Reclamação aberta" /> : null}
        <ShipmentDelayBadge shipments={row.shipments} />
      </div>
      {toForward ? (
        <Button onClick={() => onOpen(row)}>{toForwardWords(row.ownItemsOnly).button}</Button>
      ) : (
        <Hint label={ACTION_ICONS.openOrder.hint} openOnTap={false}>
          <Button variant="outline" onClick={() => onOpen(row)}>
            Abrir pedido
            <OpenOrderIcon aria-hidden="true" />
          </Button>
        </Hint>
      )}
    </li>
  );
}

/** What sold, so the order is more than its number. */
function ItemsLine({ firstTitle, itemCount }: { firstTitle: string | null; itemCount: number }) {
  const label = orderItemsLabel(firstTitle, itemCount);
  if (label === null) {
    return null;
  }
  return <p className="truncate text-sm">{label}</p>;
}

/** Each parcel's stage, or what to do before there is one; nothing when the badge says it. */
function ShipmentsLine({ row }: { row: OperationRowData }) {
  const line = shipmentsSummary(row.shipments, row.status);
  if (line === null) {
    return null;
  }
  return <p className="mt-1 text-xs text-muted-foreground">{line}</p>;
}

/** The first late parcel of the order, as a warning under its status. */
function ShipmentDelayBadge({ shipments }: { shipments: OperationRowData["shipments"] }) {
  const delay = shipments.find((shipment) => shipment.delay !== null)?.delay;
  if (delay === undefined || delay === null) {
    return null;
  }
  return (
    <HintedText
      label={SHIPMENT_DELAY_HINTS[delay] ?? SHIPMENT_DELAY_LABELS[delay]}
      className="inline-flex items-center gap-1.5 text-footnote font-medium whitespace-nowrap"
    >
      <OverdueIcon
        className="size-3.5 shrink-0 text-amber-600 dark:text-amber-500"
        weight="bold"
        aria-hidden="true"
      />
      {SHIPMENT_DELAY_LABELS[delay]}
    </HintedText>
  );
}
