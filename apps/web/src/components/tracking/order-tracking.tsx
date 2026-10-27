import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TruckIcon } from "@phosphor-icons/react";
import { SHIPMENT_DELAY_LABELS } from "@sellbridge/shared/shipment-delay";
import { ToneStatus } from "@/components/data/tone-status";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { Field } from "@/components/fulfillment/shipment-field";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trackingLine } from "@/features/fulfillment/tracking-line";
import {
  CORREIOS_CODE_EXAMPLE,
  TRACKING_QUERY_MAX_LENGTH,
  trackingQuerySchema,
} from "@/features/tracking/carrier-tracking";
import {
  orderTrackingQueryOptions,
  parcelsInTransitQueryOptions,
  trackingSearchQueryOptions,
} from "@/features/tracking/order-tracking.queries";
import type { TrackingSearchResult } from "@/features/tracking/tracking-views";
import { errorMessage } from "@/lib/errors";
import { BuyerLinkButton } from "./buyer-link-button";
import { CarrierHistory, TrackingExplanationBlock, TrackingParcel } from "./tracking-parcel";

const INVALID_CODE_MESSAGE = `Confira o que foi digitado. O código dos Correios tem 2 letras, 9 números e 2 letras, como ${CORREIOS_CODE_EXAMPLE}. O número do pedido tem só números.`;

/**
 * The Pedidos "Rastreio" tab: one box for a tracking code or an order number, the result with
 * its explanation, and the orders on their way to tap instead of typing.
 */
export function OrderTracking({
  trackOrder,
  onTrackOrder,
}: {
  trackOrder: string | undefined;
  onTrackOrder: (orderId: string | undefined) => void;
}) {
  const [searched, setSearched] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const sectionRef = useRef<HTMLElement>(null);
  const search = (query: string) => {
    onTrackOrder(undefined);
    setSearched(query);
    // The same text again is a "look again": the carrier may have scanned the parcel since.
    if (query === searched) {
      void queryClient.invalidateQueries({ queryKey: trackingSearchQueryOptions(query).queryKey });
    }
  };
  const showOrder = (orderId: string) => {
    setSearched(null);
    onTrackOrder(orderId);
    // The result opens above the list: without this, a tap on a phone seems to do nothing.
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    sectionRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  };
  return (
    <section ref={sectionRef} className="space-y-4" aria-label="Rastreio dos pedidos">
      <TrackingSearchForm onSearch={search} />
      {searched === null ? null : <SearchResult query={searched} />}
      {searched === null && trackOrder !== undefined ? <OrderResult orderId={trackOrder} /> : null}
      <InTransitList onOpen={showOrder} />
    </section>
  );
}

function TrackingSearchForm({ onSearch }: { onSearch: (query: string) => void }) {
  const [term, setTerm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = trackingQuerySchema.safeParse({ query: term });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Confira o que foi digitado");
      return;
    }
    setError(null);
    onSearch(parsed.data.query);
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-start" noValidate>
      <div className="sm:max-w-md sm:flex-1">
        <Field
          label="Código de rastreio ou número do pedido"
          placeholder={`Ex.: ${CORREIOS_CODE_EXAMPLE} ou 2000012345`}
          value={term}
          error={error}
          maxLength={TRACKING_QUERY_MAX_LENGTH}
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          onChange={(value) => {
            setTerm(value);
            setError(null);
          }}
        />
      </div>
      {/* Level with the input below the label (14px line + 8px gap), even under an error. */}
      <Button type="submit" className="h-10 sm:mt-5.5">
        Rastrear
      </Button>
    </form>
  );
}

function ResultSkeleton() {
  return (
    <output aria-busy="true" aria-label="Consultando rastreio">
      <Skeleton className="h-56 rounded-3xl" />
    </output>
  );
}

function SearchResult({ query }: { query: string }) {
  const search = useQuery(trackingSearchQueryOptions(query));
  if (search.isPending) {
    return <ResultSkeleton />;
  }
  if (search.isError) {
    return (
      <ErrorState message={errorMessage(search.error)} onRetry={() => void search.refetch()} />
    );
  }
  return <TrackingResult result={search.data} query={query} />;
}

function OrderResult({ orderId }: { orderId: string }) {
  const order = useQuery(orderTrackingQueryOptions(orderId));
  if (order.isPending) {
    return <ResultSkeleton />;
  }
  if (order.isError) {
    return <ErrorState message={errorMessage(order.error)} onRetry={() => void order.refetch()} />;
  }
  return <TrackingResult result={order.data} query={null} />;
}

/** A short, announced message in place of a result. */
function ResultMessage({ children }: { children: string }) {
  return (
    <output className="surface-card block rounded-3xl bg-card px-5 py-4 text-sm">{children}</output>
  );
}

function TrackingResult({ result, query }: { result: TrackingSearchResult; query: string | null }) {
  if (result.kind === "invalid_code") {
    return <ResultMessage>{INVALID_CODE_MESSAGE}</ResultMessage>;
  }
  if (result.kind === "order_not_found") {
    return (
      <ResultMessage>
        {`Não achamos um pedido encaminhado com o número ${query ?? ""}. Confira o número ou procure pelo código de rastreio.`}
      </ResultMessage>
    );
  }
  if (result.kind === "manual") {
    return <ManualTracking result={result} />;
  }
  if (result.parcels.length === 0) {
    return (
      <ResultMessage>
        Este pedido ainda não foi encaminhado, então não há envio para rastrear.
      </ResultMessage>
    );
  }
  return (
    <div className="space-y-4">
      {result.parcels.map((parcel) => (
        <TrackingParcel
          key={parcel.shipmentId}
          parcel={parcel}
          actions={<BuyerLinkButton shipmentId={parcel.shipmentId} />}
        />
      ))}
    </div>
  );
}

/** A code that is not in SellBridge, read straight from the carrier. */
function ManualTracking({ result }: { result: Extract<TrackingSearchResult, { kind: "manual" }> }) {
  return (
    <section
      className="surface-card space-y-4 rounded-3xl bg-card p-5"
      aria-label={`Rastreio do código ${result.code}`}
    >
      <div>
        <h3 className="font-medium break-all">Código {result.code}</h3>
        <p className="text-footnote text-muted-foreground">
          Este código não está em nenhum pedido seu. Consultamos direto na transportadora.
        </p>
      </div>
      {result.explanation === null ? null : (
        <TrackingExplanationBlock explanation={result.explanation} />
      )}
      <CarrierHistory result={result.carrierTracking} />
    </section>
  );
}

type InTransitRow = Awaited<
  ReturnType<typeof import("@/features/tracking/order-tracking.functions").parcelsInTransitFn>
>[number];

function InTransitRowView({
  row,
  onOpen,
}: {
  row: InTransitRow;
  onOpen: (orderId: string) => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-3.5">
      <div className="min-w-0 flex-[1_1_12rem] space-y-0.5">
        <p className="truncate text-sm font-medium">Pedido {row.externalOrderId}</p>
        <p className="truncate text-xs text-muted-foreground">
          {row.catalogKind === "seller" ? "Seu envio" : row.supplierName} ·{" "}
          {trackingLine(row.carrier, row.trackingCode ?? "")}
        </p>
        {row.delay === null ? null : (
          <ToneStatus tone="warning" label={SHIPMENT_DELAY_LABELS[row.delay]} />
        )}
      </div>
      <Button variant="outline" onClick={() => onOpen(row.orderId)}>
        Ver rastreio
      </Button>
    </li>
  );
}

/** The reseller's parcels on their way, the latest orders first. */
function InTransitList({ onOpen }: { onOpen: (orderId: string) => void }) {
  const query = useQuery(parcelsInTransitQueryOptions());
  if (query.isPending) {
    return <Skeleton className="h-40 rounded-3xl" />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (query.data.length === 0) {
    return (
      <EmptyState
        icon={TruckIcon}
        title="Nenhum pedido a caminho"
        description="Quando um fornecedor enviar um pedido com código de rastreio, ele aparece aqui."
      />
    );
  }
  return (
    <section aria-labelledby="in-transit-title" className="space-y-2">
      <h2 id="in-transit-title" className="text-subhead font-medium">
        Pedidos a caminho
      </h2>
      <ul className="surface-card divide-y rounded-3xl bg-card px-5">
        {query.data.map((row) => (
          <InTransitRowView key={row.shipmentId} row={row} onOpen={onOpen} />
        ))}
      </ul>
    </section>
  );
}
