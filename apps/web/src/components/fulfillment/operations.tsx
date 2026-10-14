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
import { Skeleton } from "@/components/ui/skeleton";
import { operationsQueryOptions } from "@/features/fulfillment/fulfillment.queries";
import { errorMessage } from "@/lib/errors";
import { FulfillmentDialog } from "./order-dialog";

type Search = z.infer<typeof operationsSearchSchema>;
export function Operations() {
  const [search, setSearch] = useState<Search>({ query: "", stage: "all", page: 1 });
  const [orderId, setOrderId] = useState<string | null>(null);
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
              <OperationRow key={row.id} row={row} onOpen={setOrderId} />
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
      <FulfillmentDialog orderId={orderId} onClose={() => setOrderId(null)} />
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
      <select
        aria-label="Etapa operacional"
        className="rounded-lg border border-input bg-background px-3 text-sm"
        value={search.stage}
        onChange={(event) =>
          setSearch((previous) => ({
            ...previous,
            stage: operationsSearchSchema.shape.stage.parse(event.target.value),
            page: 1,
          }))
        }
      >
        <option value="all">Todas as etapas</option>
        <option value="unforwarded">Pagos para encaminhar</option>
        {FULFILLMENT_STATUSES.map((status) => (
          <option key={status} value={status}>
            {FULFILLMENT_LABELS[status]}
          </option>
        ))}
      </select>
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
  row: Awaited<
    ReturnType<typeof import("@/features/fulfillment/fulfillment.functions").listOperationsFn>
  >["items"][number];
  onOpen: (orderId: string) => void;
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
          {row.buyerName ?? "Comprador não informado"} · {row.storeName} ·{" "}
          <SmartDate date={row.orderedAt} />
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
      <Button variant="outline" onClick={() => onOpen(row.id)}>
        Operar pedido
      </Button>
    </li>
  );
}
