import { useState, type Dispatch, type SetStateAction } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  FULFILLMENT_LABELS,
  FULFILLMENT_STATUSES,
  operationsSearchSchema,
} from "@sellbridge/shared/schemas";
import type { z } from "zod";
import { PaginationBar } from "@/components/data/pagination-bar";
import { SmartDate } from "@/components/data/smart-date";
import { ToneStatus } from "@/components/data/tone-status";
import { ErrorState } from "@/components/feedback/error-state";
import { OrderStatusBadge } from "@/components/reports/order-status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { operationsQueryOptions } from "@/features/fulfillment/fulfillment.queries";
import { displayBuyerName } from "@/features/orders/buyer-name";
import { errorMessage } from "@/lib/errors";
import { FulfillmentDialog } from "./order-dialog";

type Search = z.infer<typeof operationsSearchSchema>;
type OperationRowData = Awaited<
  ReturnType<typeof import("@/features/fulfillment/fulfillment.functions").listOperationsFn>
>["items"][number];

const STAGE_OPTIONS: { value: Search["stage"]; label: string }[] = [
  { value: "all", label: "Todas as etapas" },
  { value: "unforwarded", label: "Pagos para encaminhar" },
  ...FULFILLMENT_STATUSES.map((status) => ({ value: status, label: FULFILLMENT_LABELS[status] })),
];

export function Operations() {
  const [search, setSearch] = useState<Search>({ query: "", stage: "all", page: 1 });
  const [opened, setOpened] = useState<OperationRowData | null>(null);
  const query = useQuery(operationsQueryOptions(search));
  return (
    <section className="space-y-4" aria-label="Operação dos pedidos">
      <OperationFilters search={search} setSearch={setSearch} />
      {query.isPending ? (
        <Skeleton className="h-64 rounded-3xl" />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
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
          {query.data.items.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              Nenhum pedido encontrado nesta etapa.
            </p>
          ) : null}
          <PaginationBar
            page={query.data.page}
            totalPages={query.data.totalPages}
            total={query.data.total}
            itemLabel={{ one: "pedido", other: "pedidos" }}
            onPageChange={(page) => setSearch((previous) => ({ ...previous, page }))}
          />
        </>
      )}
      <FulfillmentDialog order={opened} onClose={() => setOpened(null)} />
    </section>
  );
}

function OperationFilters({
  search,
  setSearch,
}: {
  search: Search;
  setSearch: Dispatch<SetStateAction<Search>>;
}) {
  const [draft, setDraft] = useState(search.query);
  return (
    <form
      className="flex flex-wrap gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setSearch((previous) => ({ ...previous, query: draft, page: 1 }));
      }}
    >
      <Input
        aria-label="Buscar por pedido ou comprador"
        placeholder="Pedido ou comprador"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="max-w-sm"
      />
      <Select
        value={search.stage}
        onValueChange={(stage) =>
          setSearch((previous) => ({
            ...previous,
            stage: operationsSearchSchema.shape.stage.parse(stage),
            page: 1,
          }))
        }
      >
        <SelectTrigger className="w-full sm:w-auto sm:min-w-52" aria-label="Etapa operacional">
          <SelectValue>
            {STAGE_OPTIONS.find((option) => option.value === search.stage)?.label}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {STAGE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="outline" type="submit">
        Buscar
      </Button>
    </form>
  );
}

function OperationRow({
  row,
  onOpen,
}: {
  row: OperationRowData;
  onOpen: (row: OperationRowData) => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-4">
      {/* At least 15rem for the order's text: on a phone, status and action wrap below it. */}
      <div className="min-w-0 flex-[1_1_15rem]">
        <p className="font-medium">
          <Link
            to="/pedidos/$orderId"
            params={{ orderId: row.id }}
            className="rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {row.externalOrderId}
          </Link>
        </p>
        <p className="text-xs text-muted-foreground">
          {displayBuyerName(row.buyerName)} · {row.storeName} · <SmartDate date={row.orderedAt} />
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {row.shipments.length
            ? row.shipments
                .map(
                  (shipment) => `${shipment.supplierName}: ${FULFILLMENT_LABELS[shipment.status]}`,
                )
                .join(" · ")
            : "Ainda não encaminhado ao fornecedor"}
        </p>
      </div>
      <div className="flex flex-col items-start gap-1">
        <OrderStatusBadge status={row.status} />
        {row.stockShort ? <ToneStatus tone="warning" label="Falta estoque" /> : null}
      </div>
      <Button variant="outline" onClick={() => onOpen(row)}>
        Operar pedido
      </Button>
    </li>
  );
}
