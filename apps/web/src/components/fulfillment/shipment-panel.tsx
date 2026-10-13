import {
  DISPATCHED_FULFILLMENT_STATUSES,
  FULFILLMENT_LABELS,
  FULFILLMENT_NEXT,
  shipmentUpdateSchema,
  type DeliveryAddress,
  type FulfillmentStatus,
  SETTLED_FULFILLMENT_STATUSES,
} from "@sellbridge/shared/schemas";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { SmartDate } from "@/components/data/smart-date";
import { TONE_DOT_CLASSES, ToneStatus } from "@/components/data/tone-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { printShipment } from "@/features/fulfillment/print-shipment";
import { FULFILLMENT_TONES, shipmentTimeline } from "@/features/fulfillment/shipment-timeline";

export interface ShipmentView {
  id: string;
  supplierName: string;
  status: FulfillmentStatus;
  address: DeliveryAddress;
  items: { title: string; sku: string; quantity: number }[];
  notes: string;
  carrier: string | null;
  trackingCode: string | null;
  trackingUrl: string | null;
  events: { id: string; status: FulfillmentStatus; actor: string; note: string; createdAt: Date }[];
}
export function ShipmentPanel({
  shipment,
  externalOrderId,
  onUpdate,
  children,
  blocked = false,
}: {
  shipment: ShipmentView;
  externalOrderId: string;
  blocked?: boolean;
  onUpdate: (input: ReturnType<typeof shipmentUpdateSchema.parse>) => Promise<unknown>;
  children?: React.ReactNode;
}) {
  const {
    carrier,
    setCarrier,
    trackingCode,
    setTrackingCode,
    trackingUrl,
    setTrackingUrl,
    note,
    setNote,
    mutation,
  } = useShipmentUpdate(shipment, onUpdate);
  const next = FULFILLMENT_NEXT[shipment.status];
  const closed = SETTLED_FULFILLMENT_STATUSES.includes(shipment.status);
  return (
    <section className="surface-card space-y-4 rounded-2xl bg-card p-5">
      <ShipmentSummary shipment={shipment} />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => printShipment(shipment, externalOrderId, "label")}>
          Imprimir etiqueta de identificação
        </Button>
        <Button variant="outline" onClick={() => printShipment(shipment, externalOrderId, "order")}>
          Imprimir ordem de fornecimento
        </Button>
        {children}
      </div>
      {closed ? null : (
        <ShipmentActions
          next={blocked ? null : next}
          carrier={carrier}
          trackingCode={trackingCode}
          trackingUrl={trackingUrl}
          note={note}
          setCarrier={setCarrier}
          setTrackingCode={setTrackingCode}
          setTrackingUrl={setTrackingUrl}
          setNote={setNote}
          pending={mutation.isPending}
          status={shipment.status}
          onSubmit={(status) => mutation.mutate(status)}
        />
      )}
      <ShipmentHistory shipment={shipment} />
    </section>
  );
}
function ShipmentActions(props: {
  next: FulfillmentStatus | null;
  status: FulfillmentStatus;
  carrier: string;
  trackingCode: string;
  trackingUrl: string;
  note: string;
  pending: boolean;
  setCarrier: (value: string) => void;
  setTrackingCode: (value: string) => void;
  setTrackingUrl: (value: string) => void;
  setNote: (value: string) => void;
  onSubmit: (status: FulfillmentStatus) => void;
}) {
  return (
    <div className="space-y-3">
      {props.next === "shipped" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Transportadora" value={props.carrier} onChange={props.setCarrier} />
          <Field
            label="Código de rastreio"
            value={props.trackingCode}
            onChange={props.setTrackingCode}
          />
          <div className="sm:col-span-2">
            <Field
              label="Link de rastreio (HTTPS, opcional)"
              value={props.trackingUrl}
              onChange={props.setTrackingUrl}
            />
          </div>
        </div>
      ) : null}
      <Field label="Ocorrência ou observação" value={props.note} onChange={props.setNote} />
      <div className="flex flex-wrap gap-2">
        {props.next ? (
          <Button disabled={props.pending} onClick={() => props.next && props.onSubmit(props.next)}>
            {FULFILLMENT_LABELS[props.next]}
          </Button>
        ) : null}
        <Button
          variant="outline"
          disabled={props.pending || !props.note.trim()}
          onClick={() => props.onSubmit(props.status)}
        >
          Registrar ocorrência
        </Button>
        {DISPATCHED_FULFILLMENT_STATUSES.includes(props.status) ? null : (
          <Button
            variant="destructive"
            disabled={props.pending || !props.note.trim()}
            onClick={() => props.onSubmit("cancelled")}
          >
            Cancelar envio
          </Button>
        )}
      </div>
    </div>
  );
}
export function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Label className="grid gap-2">
      {label}
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </Label>
  );
}

function useShipmentUpdate(
  shipment: ShipmentView,
  onUpdate: (input: ReturnType<typeof shipmentUpdateSchema.parse>) => Promise<unknown>,
) {
  const [carrier, setCarrier] = useState(shipment.carrier ?? "");
  const [trackingCode, setTrackingCode] = useState(shipment.trackingCode ?? "");
  const [trackingUrl, setTrackingUrl] = useState(shipment.trackingUrl ?? "");
  const [note, setNote] = useState("");
  const mutation = useMutation({
    mutationFn: async (status: FulfillmentStatus) => {
      const parsed = shipmentUpdateSchema.safeParse({
        shipmentId: shipment.id,
        status,
        carrier,
        trackingCode,
        trackingUrl,
        note,
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Confira os dados");
      await onUpdate(parsed.data);
    },
    onSuccess: () => {
      setNote("");
      toast.success("Envio atualizado");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return {
    carrier,
    setCarrier,
    trackingCode,
    setTrackingCode,
    trackingUrl,
    setTrackingUrl,
    note,
    setNote,
    mutation,
  };
}

function ShipmentSummary({ shipment }: { shipment: ShipmentView }) {
  return (
    <>
      {" "}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{shipment.supplierName}</h3>
        <ToneStatus
          tone={FULFILLMENT_TONES[shipment.status]}
          label={FULFILLMENT_LABELS[shipment.status]}
        />
      </div>
      <ul className="space-y-1 text-sm">
        {shipment.items.map((item, index) => (
          <li key={`${item.sku}-${index}`}>
            {item.quantity} × {item.title} <span className="text-muted-foreground">{item.sku}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">
        {shipment.address.recipient} · {shipment.address.street}, {shipment.address.number}{" "}
        {shipment.address.complement} · {shipment.address.neighborhood} · {shipment.address.city}/
        {shipment.address.state} · CEP {shipment.address.postalCode}
      </p>
      {shipment.notes ? <p className="text-sm">Instruções: {shipment.notes}</p> : null}
      {shipment.trackingCode ? (
        <p className="text-sm">
          {shipment.carrier} · {shipment.trackingCode}{" "}
          {shipment.trackingUrl ? (
            <a
              href={shipment.trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Consultar rastreio
            </a>
          ) : null}
        </p>
      ) : null}
    </>
  );
}

/** Newest first on a rail, like the customer timeline: each step in its status color. */
function ShipmentHistory({ shipment }: { shipment: ShipmentView }) {
  return (
    <div className="border-t pt-4">
      <ol
        aria-label="Histórico do envio"
        className="relative space-y-3 before:absolute before:top-1.5 before:bottom-1.5 before:left-[3px] before:w-px before:bg-border"
      >
        {shipmentTimeline(shipment.events).map((event) => (
          <li key={event.id} className="relative grid grid-cols-[7px_minmax(0,1fr)_auto] gap-3">
            <span
              aria-hidden="true"
              className={cn(
                "mt-1.5 size-[7px] rounded-full ring-2 ring-card",
                TONE_DOT_CLASSES[FULFILLMENT_TONES[event.status]],
              )}
            />
            <span className="min-w-0 text-footnote">
              <span className="block text-foreground">{FULFILLMENT_LABELS[event.status]}</span>
              <span className="block text-muted-foreground">por {event.actor}</span>
              {event.note ? (
                <span className="block break-words text-muted-foreground">{event.note}</span>
              ) : null}
            </span>
            <SmartDate date={event.createdAt} className="text-footnote text-muted-foreground" />
          </li>
        ))}
      </ol>
    </div>
  );
}
