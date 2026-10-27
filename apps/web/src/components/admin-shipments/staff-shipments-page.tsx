import type { listStaffShipments } from "@sellbridge/database/repositories";
import {
  STAFF_SHIPMENT_GROUP_LABELS,
  STAFF_SHIPMENT_GROUPS,
  type StaffShipmentGroup,
  type StaffShipmentSearch,
} from "@sellbridge/shared/schemas";
import { SHIPMENT_DELAY_LABELS } from "@sellbridge/shared/shipment-delay";
import { TruckIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { FilterTabs, type FilterTab } from "@/components/data/filter-tabs";
import { PaginationBar } from "@/components/data/pagination-bar";
import { SearchInput } from "@/components/data/search-input";
import { ToneStatus } from "@/components/data/tone-status";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { TrackingParcel } from "@/components/tracking/tracking-parcel";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  staffParcelTrackingQueryOptions,
  staffShipmentCountsQueryOptions,
  staffShipmentsQueryOptions,
} from "@/features/admin-shipments/shipments.queries";
import { FULFILLMENT_TONES, shipmentStatusLabel } from "@/features/fulfillment/shipment-timeline";
import { trackingLine } from "@/features/fulfillment/tracking-line";
import { useUrlSearchQuery } from "@/hooks/use-url-search-query";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

type StaffShipmentRow = Awaited<ReturnType<typeof listStaffShipments>>["items"][number];

function groupTabs(
  counts: Record<StaffShipmentGroup, number> | undefined,
): FilterTab<StaffShipmentGroup>[] {
  return STAFF_SHIPMENT_GROUPS.map((group) => ({
    value: group,
    label: STAFF_SHIPMENT_GROUP_LABELS[group],
    count: counts?.[group],
  }));
}

function ShipmentRow({
  row,
  selected,
  onSelect,
}: {
  row: StaffShipmentRow;
  selected: boolean;
  onSelect: (shipmentId: string) => void;
}) {
  return (
    <TableRow
      data-state={selected ? "selected" : undefined}
      className={cn(selected && "bg-muted/50")}
    >
      <TableCell className="align-top whitespace-normal">
        <button
          type="button"
          className="text-left font-medium [overflow-wrap:anywhere] underline-offset-4 hover:underline"
          aria-pressed={selected}
          onClick={() => onSelect(row.shipmentId)}
        >
          Pedido {row.externalOrderId}
        </button>
      </TableCell>
      <TableCell className="align-top">
        <p className="truncate">{row.sellerName}</p>
        <p className="truncate text-xs text-muted-foreground">
          {row.catalogKind === "seller" ? "Estoque do revendedor" : row.supplierName}
        </p>
      </TableCell>
      <TableCell className="align-top text-xs break-all whitespace-normal">
        {row.trackingCode === null ? (
          <span className="text-muted-foreground">Sem código</span>
        ) : (
          trackingLine(row.carrier, row.trackingCode)
        )}
      </TableCell>
      <TableCell className="space-y-1 align-top">
        <ToneStatus
          tone={FULFILLMENT_TONES[row.status]}
          label={shipmentStatusLabel(row.status, row.catalogKind)}
        />
        {row.delay === null ? null : (
          <ToneStatus tone="warning" label={SHIPMENT_DELAY_LABELS[row.delay]} />
        )}
      </TableCell>
    </TableRow>
  );
}

function ShipmentsTable({
  search,
  onSelect,
  onPageChange,
}: {
  search: StaffShipmentSearch;
  onSelect: (shipmentId: string) => void;
  onPageChange: (page: number) => void;
}) {
  const query = useQuery(
    staffShipmentsQueryOptions({ group: search.group, query: search.query, page: search.page }),
  );
  if (query.isPending) {
    return <Skeleton className="h-96 rounded-3xl" />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (query.data.items.length === 0) {
    return (
      <EmptyState
        icon={TruckIcon}
        title="Nenhum envio encontrado"
        description="Troque o filtro ou procure por outro código, pedido ou cliente."
      />
    );
  }
  return (
    <div className="space-y-3">
      <ShipmentsTableBody
        rows={query.data.items}
        selectedId={search.shipment}
        onSelect={onSelect}
      />
      <PaginationBar
        page={query.data.page}
        totalPages={query.data.totalPages}
        total={query.data.total}
        itemLabel={{ one: "envio", other: "envios" }}
        onPageChange={onPageChange}
      />
    </div>
  );
}

function ShipmentsTableBody({
  rows,
  selectedId,
  onSelect,
}: {
  rows: readonly StaffShipmentRow[];
  selectedId: string | undefined;
  onSelect: (shipmentId: string) => void;
}) {
  return (
    <div className="surface-card overflow-x-auto rounded-3xl bg-card">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[24%]">Pedido</TableHead>
            <TableHead className="w-[26%]">Revendedor e fornecedor</TableHead>
            <TableHead className="w-[28%]">Rastreio</TableHead>
            <TableHead className="w-[22%]">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <ShipmentRow
              key={row.shipmentId}
              row={row}
              selected={row.shipmentId === selectedId}
              onSelect={onSelect}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ParcelDetail({ shipmentId }: { shipmentId: string | undefined }) {
  const query = useQuery({
    ...staffParcelTrackingQueryOptions(shipmentId ?? ""),
    enabled: shipmentId !== undefined,
  });
  if (shipmentId === undefined) {
    return (
      <p className="surface-card rounded-3xl bg-card p-5 text-sm text-muted-foreground">
        Escolha um pedido na lista para ver o rastreio.
      </p>
    );
  }
  if (query.isPending) {
    return <Skeleton className="h-80 rounded-3xl" />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (query.data === null) {
    return (
      <p className="surface-card rounded-3xl bg-card p-5 text-sm text-muted-foreground">
        Este envio não existe mais.
      </p>
    );
  }
  return <TrackingParcel parcel={query.data} reader="staff" />;
}

/** `/admin/envios`: every customer's parcels, filters on the left, the chosen one on the right. */
export function StaffShipmentsPage({
  search,
  onSearchChange,
}: {
  search: StaffShipmentSearch;
  onSearchChange: (patch: Partial<StaffShipmentSearch>) => void;
}) {
  const counts = useQuery(staffShipmentCountsQueryOptions());
  const { term, setTerm } = useUrlSearchQuery({
    urlQuery: search.query,
    commitQuery: (value) => onSearchChange({ query: value, page: 1 }),
  });
  return (
    <>
      <PageHeader
        title="Envios"
        description="Os pacotes de todos os clientes, da última mudança para a mais antiga."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-end">
        <FilterTabs
          legend="Filtrar envios"
          tabs={groupTabs(counts.data)}
          value={search.group}
          onChange={(group) => onSearchChange({ group, page: 1 })}
        />
        <div className="space-y-1.5">
          <p className="pl-4 text-sm font-medium" aria-hidden="true">
            Pesquisar rastreio
          </p>
          <SearchInput
            label="Pesquisar rastreio"
            placeholder="Código, pedido ou cliente"
            iconClassName="left-3.5"
            inputClassName="pl-10"
            value={term}
            onValueChange={setTerm}
          />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <ShipmentsTable
          search={search}
          onSelect={(shipment) => onSearchChange({ shipment })}
          onPageChange={(page) => onSearchChange({ page })}
        />
        <aside className="lg:sticky lg:top-28">
          <ParcelDetail shipmentId={search.shipment} />
        </aside>
      </div>
    </>
  );
}
