import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { DotTimeline, DotTimelineItem } from "@/components/data/dot-timeline";
import { TONE_DOT_CLASSES } from "@/components/data/tone-status";
import { cn } from "@/lib/utils";
import {
  carrierEventsOldestFirst,
  type CarrierTrackingResult,
} from "@/features/tracking/carrier-tracking";
import {
  CARRIER_EVENT_TONES,
  parcelHistory,
  parcelProgress,
} from "@/features/tracking/parcel-history";
import type { TrackedParcelView } from "@/features/tracking/tracking-views";
import {
  PARCEL_HOLDER_LABELS,
  type TrackingExplanation,
} from "@/features/tracking/tracking-explanation";
import { ParcelCodeBox, ParcelHistoryList, ParcelProgress } from "./parcel-parts";

/** "O que aconteceu com o pedido": who has the parcel and whose step is late, above the events. */
export function TrackingExplanationBlock({ explanation }: { explanation: TrackingExplanation }) {
  return (
    <div
      className="space-y-1.5 rounded-xl bg-muted/60 px-4 py-3"
      data-testid="tracking-explanation"
    >
      <p className="text-footnote text-muted-foreground">O que aconteceu com o pedido</p>
      <p className="flex items-center gap-2 font-medium">
        <span
          aria-hidden="true"
          className={cn("size-2 shrink-0 rounded-full", TONE_DOT_CLASSES[explanation.tone])}
        />
        {explanation.title}
      </p>
      <p className="text-sm">
        <span className="text-muted-foreground">Onde está agora: </span>
        {PARCEL_HOLDER_LABELS[explanation.holder]}
      </p>
      {explanation.lines.map((line) => (
        <p key={line} className="text-sm text-pretty text-muted-foreground">
          {line}
        </p>
      ))}
    </div>
  );
}

const CARRIER_STATE_MESSAGES: Record<Exclude<CarrierTrackingResult["state"], "found">, string> = {
  not_connected:
    "A consulta direto na transportadora ainda não está ligada. Por enquanto, use o link de rastreio, se houver.",
  not_found: "A transportadora ainda não conhece este código. Ele aparece depois da postagem.",
  unavailable: "Não conseguimos consultar a transportadora agora. Tente de novo em alguns minutos.",
};

/** The carrier's steps, newest first. */
export function CarrierHistory({ result }: { result: CarrierTrackingResult }) {
  if (result.state !== "found") {
    return <p className="text-sm text-muted-foreground">{CARRIER_STATE_MESSAGES[result.state]}</p>;
  }
  const events = carrierEventsOldestFirst(result.events).toReversed();
  return (
    <div className="space-y-3">
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          A transportadora ainda não registrou nenhum passo.
        </p>
      ) : (
        <DotTimeline label={`Passos na transportadora (${result.carrier})`}>
          {events.map((event) => (
            <DotTimelineItem
              key={`${event.at.toISOString()}-${event.kind}`}
              dotClassName={TONE_DOT_CLASSES[CARRIER_EVENT_TONES[event.kind]]}
              date={event.at}
            >
              <span className="block text-foreground">{event.description}</span>
              {event.place === null ? null : (
                <span className="block text-muted-foreground">{event.place}</span>
              )}
            </DotTimelineItem>
          ))}
        </DotTimeline>
      )}
    </div>
  );
}

/** Why the carrier's scans are missing, when they are: shown under the history. */
function CarrierNote({ parcel }: { parcel: TrackedParcelView }) {
  if (parcel.trackingCode === null) {
    return null;
  }
  if (parcel.carrierTracking === null) {
    return (
      <p className="text-sm text-muted-foreground">
        A consulta automática funciona com códigos dos Correios.
        {parcel.trackingUrl === null ? null : " Use o link de rastreio acima."}
      </p>
    );
  }
  if (parcel.carrierTracking.state === "found") {
    return null;
  }
  return (
    <p className="text-sm text-muted-foreground">
      {CARRIER_STATE_MESSAGES[parcel.carrierTracking.state]}
    </p>
  );
}

function ownerLabel(parcel: TrackedParcelView, reader: TrackingReader) {
  if (parcel.catalogKind === "seller") {
    return reader === "reseller" ? "Seu envio" : "Estoque do revendedor";
  }
  return parcel.supplierName;
}

function carrierEventsOfParcel(parcel: TrackedParcelView) {
  return parcel.carrierTracking?.state === "found" ? parcel.carrierTracking.events : [];
}

type TrackingReader = "reseller" | "supplier" | "staff";

/** The order number and whose parcel it is; only the reseller opens the order page. */
function ParcelHeader({ parcel, reader }: { parcel: TrackedParcelView; reader: TrackingReader }) {
  const owner = ownerLabel(parcel, reader);
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
      <div className="min-w-0">
        <h3 className="font-medium break-all">Pedido {parcel.externalOrderId}</h3>
        {/* The supplier never gets the reseller's store: it would lead around the reseller. */}
        {reader === "supplier" ? null : (
          <p className="text-footnote text-muted-foreground">
            {owner} · {parcel.storeName}
          </p>
        )}
      </div>
      {reader === "reseller" ? (
        <Link
          to="/pedidos/$orderId"
          params={{ orderId: parcel.orderId }}
          className="text-sm underline-offset-4 hover:underline"
        >
          Ver pedido
        </Link>
      ) : null}
    </div>
  );
}

/**
 * One parcel as everyone reads it (reseller, supplier, staff): whose it is, the explanation, its
 * steps, its code and one history. `actions` holds what the reader may do. Only the reseller
 * opens the order page; the supplier reads its parcel under the store it sells for.
 */
export function TrackingParcel({
  parcel,
  actions,
  reader = "reseller",
}: {
  parcel: TrackedParcelView;
  actions?: ReactNode;
  reader?: TrackingReader;
}) {
  const progress = parcelProgress(parcel.status);
  const history = parcelHistory({
    steps: parcel.steps,
    carrierEvents: carrierEventsOfParcel(parcel),
    catalogKind: parcel.catalogKind,
  });
  return (
    <section
      className="surface-card space-y-5 rounded-3xl bg-card p-5 sm:p-6"
      aria-label={`Rastreio do pedido ${parcel.externalOrderId}`}
    >
      <ParcelHeader parcel={parcel} reader={reader} />
      <TrackingExplanationBlock explanation={parcel.explanation} />
      {progress === null ? null : <ParcelProgress steps={progress} />}
      {parcel.trackingCode === null ? (
        <p className="text-sm text-muted-foreground">Ainda sem código de rastreio.</p>
      ) : (
        <ParcelCodeBox
          carrier={parcel.carrier}
          code={parcel.trackingCode}
          url={parcel.trackingUrl}
        />
      )}
      <div className="space-y-3">
        <h4 className="text-sm font-medium">Histórico do envio</h4>
        <ParcelHistoryList entries={history} />
        <CarrierNote parcel={parcel} />
      </div>
      {actions === undefined ? null : (
        <div className="flex flex-wrap gap-2 border-t pt-4">{actions}</div>
      )}
    </section>
  );
}
