import { Link } from "@tanstack/react-router";
import { DotTimeline, DotTimelineItem } from "@/components/data/dot-timeline";
import { TONE_DOT_CLASSES, type StatusTone } from "@/components/data/tone-status";
import { cn } from "@/lib/utils";
import {
  carrierEventsOldestFirst,
  type CarrierEventKind,
  type CarrierTrackingResult,
} from "@/features/tracking/carrier-tracking";
import type { TrackedParcelView } from "@/features/tracking/tracking-views";
import {
  PARCEL_HOLDER_LABELS,
  type TrackingExplanation,
} from "@/features/tracking/tracking-explanation";
import { trackingLine } from "@/features/fulfillment/tracking-line";

const EVENT_TONES: Record<CarrierEventKind, StatusTone> = {
  posted: "info",
  in_transit: "info",
  out_for_delivery: "info",
  delivery_failed: "warning",
  awaiting_pickup: "warning",
  returning: "danger",
  delivered: "success",
};

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

/** The carrier's steps, newest first, with a clear note when they are a demonstration. */
export function CarrierHistory({ result }: { result: CarrierTrackingResult }) {
  if (result.state !== "found") {
    return <p className="text-sm text-muted-foreground">{CARRIER_STATE_MESSAGES[result.state]}</p>;
  }
  const events = carrierEventsOldestFirst(result.events).toReversed();
  return (
    <div className="space-y-3">
      {result.simulated ? (
        <p className="rounded-lg border border-dashed px-3 py-2 text-footnote text-muted-foreground">
          Demonstração: estes passos são simulados, não vêm da transportadora.
        </p>
      ) : null}
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          A transportadora ainda não registrou nenhum passo.
        </p>
      ) : (
        <DotTimeline label={`Passos na transportadora (${result.carrier})`}>
          {events.map((event) => (
            <DotTimelineItem
              key={`${event.at.toISOString()}-${event.kind}`}
              dotClassName={TONE_DOT_CLASSES[EVENT_TONES[event.kind]]}
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

/** What the carrier part shows when there is no Correios code to read. */
function UntrackedCode({ parcel }: { parcel: TrackedParcelView }) {
  if (parcel.trackingCode === null) {
    return null;
  }
  return (
    <p className="text-sm text-muted-foreground">
      A consulta automática funciona com códigos dos Correios.
      {parcel.trackingUrl === null ? null : " Use o link de rastreio acima."}
    </p>
  );
}

function ParcelCode({ parcel }: { parcel: TrackedParcelView }) {
  if (parcel.trackingCode === null) {
    return <p className="text-sm text-muted-foreground">Ainda sem código de rastreio.</p>;
  }
  return (
    <p className="text-sm break-all">
      {trackingLine(parcel.carrier, parcel.trackingCode)}{" "}
      {parcel.trackingUrl === null ? null : (
        <a
          href={parcel.trackingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Abrir link de rastreio
        </a>
      )}
    </p>
  );
}

/** One parcel of an order: whose it is, its code, the explanation and the carrier's steps. */
export function TrackingParcel({ parcel }: { parcel: TrackedParcelView }) {
  const owner = parcel.catalogKind === "seller" ? "Seu envio" : parcel.supplierName;
  return (
    <section
      className="surface-card space-y-4 rounded-3xl bg-card p-5"
      aria-label={`Rastreio do pedido ${parcel.externalOrderId}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 className="font-medium break-all">Pedido {parcel.externalOrderId}</h3>
          <p className="text-footnote text-muted-foreground">
            {owner} · {parcel.storeName}
          </p>
        </div>
        <Link
          to="/pedidos/$orderId"
          params={{ orderId: parcel.orderId }}
          className="text-sm underline-offset-4 hover:underline"
        >
          Ver pedido
        </Link>
      </div>
      <ParcelCode parcel={parcel} />
      <TrackingExplanationBlock explanation={parcel.explanation} />
      {parcel.carrierTracking === null ? (
        <UntrackedCode parcel={parcel} />
      ) : (
        <CarrierHistory result={parcel.carrierTracking} />
      )}
    </section>
  );
}
