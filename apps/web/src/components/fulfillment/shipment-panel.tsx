import {
  DELIVERY_CONFIRMED_BY,
  DISPATCHED_FULFILLMENT_STATUSES,
  FULFILLMENT_NEXT,
  shipmentUpdateSchema,
  type DeliveryAddress,
  type FulfillmentStatus,
  SETTLED_FULFILLMENT_STATUSES,
  type ShipmentOperator,
} from "@sellbridge/shared/schemas";
import { SHIPMENT_DELAY_LABELS, type ShipmentDelay } from "@sellbridge/shared/shipment-delay";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { DotTimeline, DotTimelineItem } from "@/components/data/dot-timeline";
import { ShipmentDates } from "./shipment-dates";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { FormErrorAlert } from "@/components/form/form-feedback";
import { TextareaField } from "@/components/form/textarea-field";
import { TONE_DOT_CLASSES, ToneStatus } from "@/components/data/tone-status";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";
import { contactWarning } from "@/features/fulfillment/contact-warning";
import { dispatchFieldsFor } from "@/features/fulfillment/dispatch-fields";
import { printShipment } from "@/features/fulfillment/print-shipment";
import {
  FULFILLMENT_TONES,
  shipmentTimeline,
  shipmentStatusLabel,
} from "@/features/fulfillment/shipment-timeline";
import { trackingLine } from "@/features/fulfillment/tracking-line";
import { ShipmentActionHint, ShipmentActionIcon, StepButton } from "./shipment-hints";

import { Field } from "./shipment-field";
export { Field } from "./shipment-field";
import { CorrectTrackingCode } from "./correct-tracking-code";
import { OwnShipmentActions } from "./own-shipment-actions";
import { OrderMessages } from "./order-messages";
import { splitShipmentEvents } from "@/features/fulfillment/order-messages";

export interface ShipmentView {
  catalogKind?: "seller" | "supplier";
  id: string;
  supplierName: string;
  status: FulfillmentStatus;
  /** Null on a supplier link once the parcel or the order is over: the buyer's data stops there. */
  address: DeliveryAddress | null;
  items: { title: string; sku: string; quantity: number }[];
  notes: string;
  carrier: string | null;
  trackingCode: string | null;
  trackingUrl: string | null;
  /** The marketplace's dates and what is late; absent on the supplier link. */
  estimatedDeliveryAt?: Date | null;
  dispatchDeadlineAt?: Date | null;
  /** By when the supplier must accept and dispatch, while the parcel is still with it. */
  acceptBy?: Date | null;
  dispatchBy?: Date | null;
  delay?: ShipmentDelay | null;
  events: { id: string; status: FulfillmentStatus; actor: string; note: string; createdAt: Date }[];
}

/** The supplier's part ends at dispatch: the marketplace or the reseller confirms the delivery. */
function nextStepFor(
  status: FulfillmentStatus,
  actsAs: ShipmentOperator,
): FulfillmentStatus | null {
  const next = FULFILLMENT_NEXT[status];
  return actsAs === "supplier" && next === "delivered" ? null : next;
}

export function ShipmentPanel({
  shipment,
  externalOrderId,
  onUpdate,
  children,
  blocked = false,
  actsAs = "reseller",
  showHistory = true,
}: {
  shipment: ShipmentView;
  externalOrderId: string;
  blocked?: boolean;
  /** Who works the panel: the supplier (by link) cannot declare the delivery. */
  actsAs?: ShipmentOperator;
  /** Off where the tracking card above already shows the same history. */
  showHistory?: boolean;
  onUpdate: (input: ReturnType<typeof shipmentUpdateSchema.parse>) => Promise<unknown>;
  children?: React.ReactNode;
}) {
  const update = useShipmentUpdate(shipment, onUpdate);
  const next = nextStepFor(shipment.status, actsAs);
  const closed = SETTLED_FULFILLMENT_STATUSES.includes(shipment.status);
  return (
    <section className="surface-card space-y-4 rounded-2xl bg-card p-5">
      <ShipmentSummary shipment={shipment} />
      <ShipmentToolbar shipment={shipment} externalOrderId={externalOrderId} operator={actsAs}>
        {children}
      </ShipmentToolbar>
      {closed ? null : shipment.catalogKind === "seller" ? (
        <OwnShipmentActions update={update} shipment={shipment} next={blocked ? null : next} />
      ) : (
        <ShipmentActions
          update={update}
          shipment={shipment}
          next={blocked ? null : next}
          actsAs={actsAs}
        />
      )}
      {shipment.status === "shipped" && shipment.trackingCode !== null && !blocked ? (
        <CorrectTrackingCode
          shipment={{ ...shipment, trackingCode: shipment.trackingCode }}
          onUpdate={onUpdate}
        />
      ) : null}
      {shipment.catalogKind === "seller" ? null : (
        <OrderMessages shipment={shipment} reader={actsAs} canWrite={!closed} onUpdate={onUpdate} />
      )}
      {showHistory ? <ShipmentHistory shipment={shipment} reader={actsAs} /> : null}
    </section>
  );
}
/** Printing, plus whatever the page adds (the reseller's link, the official label). */
function ShipmentToolbar({
  shipment,
  externalOrderId,
  operator,
  children,
}: {
  shipment: ShipmentView;
  externalOrderId: string;
  operator: ShipmentOperator;
  children?: React.ReactNode;
}) {
  return (
    // On the narrowest phones a long label wraps inside its button instead of overflowing.
    <div className="flex flex-wrap gap-2 [&>*]:h-auto [&>*]:min-h-9 [&>*]:max-w-full [&>*]:py-1.5 [&>*]:whitespace-normal">
      {/* Both documents carry the buyer's address, which a finished supplier link no longer has. */}
      {shipment.address ? (
        <>
          <ShipmentActionHint action="printLabel" operator={operator}>
            <Button
              variant="outline"
              onClick={() => printShipment(shipment, externalOrderId, "label")}
            >
              <ShipmentActionIcon action="printLabel" />
              Imprimir etiqueta de identificação
            </Button>
          </ShipmentActionHint>
          <ShipmentActionHint action="printOrder" operator={operator}>
            <Button
              variant="outline"
              onClick={() => printShipment(shipment, externalOrderId, "order")}
            >
              <ShipmentActionIcon action="printOrder" />
              {shipment.catalogKind === "seller"
                ? "Imprimir lista de separação"
                : "Imprimir ordem de fornecimento"}
            </Button>
          </ShipmentActionHint>
        </>
      ) : null}
      {children}
    </div>
  );
}

export type ShipmentUpdate = ReturnType<typeof useShipmentUpdate>;

/** What dispatch needs: carrier and tracking. */
function DispatchFields({ update }: { update: ShipmentUpdate }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Transportadora" value={update.carrier} onChange={update.setCarrier} />
      {/* Codes and links are typed exactly: no capital first letter or "correction" on phones. */}
      <Field
        label="Código de rastreio"
        value={update.trackingCode}
        onChange={update.setTrackingCode}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
      />
      <div className="sm:col-span-2">
        <Field
          label="Link de rastreio (opcional)"
          value={update.trackingUrl}
          onChange={update.setTrackingUrl}
          type="url"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>
    </div>
  );
}

/**
 * The note that goes with the next step or the cancel: a contact in it never leaves the form.
 * Talking to the other side is in "Mensagens do pedido".
 */
function useStepNote(update: ShipmentUpdate) {
  const [noteError, setNoteError] = useState<string | null>(null);
  const contactInNote = contactWarning(update.note);
  // A contact is pointed out when leaving the field or sending, not on every key: a long order
  // number looks like a phone until it is typed in full.
  const sendWithNote = (status: FulfillmentStatus) => {
    if (contactInNote !== null) {
      setNoteError(contactInNote);
      return;
    }
    update.mutation.mutate({ status, note: update.note });
  };
  return { noteError, setNoteError, contactInNote, sendWithNote };
}

function ShipmentActions({
  update,
  shipment,
  next,
  actsAs,
}: {
  update: ShipmentUpdate;
  shipment: ShipmentView;
  next: FulfillmentStatus | null;
  actsAs: ShipmentOperator;
}) {
  const { noteError, setNoteError, contactInNote, sendWithNote } = useStepNote(update);
  const pending = update.mutation.isPending;
  const operator = actsAs;
  return (
    <div className="space-y-3">
      {/* Shipped, seen by the supplier: say who confirms the delivery instead of offering it. */}
      {actsAs === "supplier" && shipment.status === "shipped" ? (
        <p className="text-sm text-muted-foreground">{DELIVERY_CONFIRMED_BY}</p>
      ) : null}
      {next === "shipped" ? <DispatchFields update={update} /> : null}
      <Field
        label="Observação da etapa (opcional)"
        value={update.note}
        error={noteError}
        onBlur={() => setNoteError(contactInNote)}
        onChange={(value) => {
          update.setNote(value);
          setNoteError(null);
        }}
      />
      <div className="flex flex-wrap gap-2">
        {next ? (
          <StepButton
            next={next}
            operator={operator}
            disabled={pending}
            onAdvance={() => sendWithNote(next)}
          />
        ) : null}
        {DISPATCHED_FULFILLMENT_STATUSES.includes(shipment.status) ? null : (
          <CancelShipment update={update} supplierName={shipment.supplierName} actsAs={actsAs} />
        )}
      </div>
    </div>
  );
}

/** What cancelling means for whoever does it: the supplier hands the order back to the store. */
function cancelCopy(actsAs: ShipmentOperator, supplierName: string) {
  if (actsAs === "supplier") {
    return {
      title: "Cancelar este envio?",
      description:
        "A loja é avisada com o motivo e pode encaminhar o pedido a outro fornecedor. Depois disso, este link só mostra o histórico.",
    };
  }
  return {
    title: `Cancelar o envio de ${supplierName}?`,
    description:
      "O link do fornecedor deixa de valer. Enquanto o pedido estiver pago, dá para reencaminhar depois, com um link novo.",
  };
}

/** The cancel dialog's state; whatever was typed as an occurrence opens as the reason. */
function useCancelShipment(update: ShipmentUpdate) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  return {
    open,
    setOpen,
    reason,
    error,
    start: () => {
      setReason(update.note);
      setError(null);
      setOpen(true);
    },
    edit: (value: string) => {
      setReason(value);
      setError(null);
    },
    confirm: () => {
      if (!reason.trim()) {
        setError("Informe o motivo do cancelamento");
        return;
      }
      update.mutation.mutate(
        { status: "cancelled", note: reason },
        { onSuccess: () => setOpen(false) },
      );
    },
  };
}

/** One tap never cancels: the dialog asks for the reason the store (or supplier) will read. */
function CancelShipment({
  update,
  supplierName,
  actsAs,
}: {
  update: ShipmentUpdate;
  supplierName: string;
  actsAs: ShipmentOperator;
}) {
  const dialog = useCancelShipment(update);
  const copy = cancelCopy(actsAs, supplierName);
  return (
    <>
      <ShipmentActionHint action="cancelShipment" operator={actsAs}>
        <Button variant="destructive" disabled={update.mutation.isPending} onClick={dialog.start}>
          <ShipmentActionIcon action="cancelShipment" />
          Cancelar envio
        </Button>
      </ShipmentActionHint>
      <ConfirmDialog
        open={dialog.open}
        onOpenChange={dialog.setOpen}
        title={copy.title}
        description={copy.description}
        confirmLabel="Cancelar envio"
        pendingLabel="Cancelando…"
        cancelLabel="Voltar"
        destructive
        isPending={update.mutation.isPending}
        onConfirm={dialog.confirm}
      >
        <div className="grid gap-3">
          <TextareaField
            id="cancel-shipment-reason"
            label="Motivo do cancelamento"
            value={dialog.reason}
            errors={[]}
            maxLength={500}
            aria-invalid={dialog.error ? true : undefined}
            onValueChange={dialog.edit}
          />
          <FormErrorAlert message={dialog.error} />
        </div>
      </ConfirmDialog>
    </>
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
    mutationFn: async (change: { status: FulfillmentStatus; note: string }) => {
      const parsed = shipmentUpdateSchema.safeParse({
        shipmentId: shipment.id,
        status: change.status,
        ...dispatchFieldsFor(shipment.status, change.status, {
          carrier,
          trackingCode,
          trackingUrl,
        }),
        note: change.note,
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

/** The marketplace's date that matters now: when to dispatch, then when it should arrive. */
function ShipmentSummary({ shipment }: { shipment: ShipmentView }) {
  return (
    <>
      {" "}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-medium">
          {shipment.catalogKind === "seller" ? "Seu envio" : shipment.supplierName}
        </h3>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <ToneStatus
            tone={FULFILLMENT_TONES[shipment.status]}
            label={shipmentStatusLabel(shipment.status, shipment.catalogKind)}
          />
          {shipment.delay ? (
            <ToneStatus tone="warning" label={SHIPMENT_DELAY_LABELS[shipment.delay]} />
          ) : null}
        </div>
      </div>
      {shipment.catalogKind === "seller" ? (
        <p className="text-sm text-muted-foreground">Você prepara e envia estes itens.</p>
      ) : null}
      <ShipmentDates shipment={shipment} />
      <ul className="space-y-1 text-sm">
        {shipment.items.map((item, index) => (
          <li key={`${item.sku}-${index}`}>
            {item.quantity} × {item.title} <span className="text-muted-foreground">{item.sku}</span>
          </li>
        ))}
      </ul>
      {shipment.address ? (
        <p className="text-sm text-muted-foreground">
          {shipment.address.recipient} · {shipment.address.street}, {shipment.address.number}{" "}
          {shipment.address.complement} · {shipment.address.neighborhood} · {shipment.address.city}/
          {shipment.address.state} · CEP {shipment.address.postalCode}
        </p>
      ) : null}
      {shipment.notes ? <p className="text-sm">Instruções: {shipment.notes}</p> : null}
      {shipment.trackingCode ? (
        <p className="text-sm">
          {trackingLine(shipment.carrier, shipment.trackingCode)}{" "}
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

/**
 * Newest first on a rail, like the customer timeline: each step in its status color. Messages
 * live in "Mensagens do pedido", so no note shows twice.
 */
function ShipmentHistory({
  shipment,
  reader,
}: {
  shipment: ShipmentView;
  reader: ShipmentOperator;
}) {
  const { steps } = splitShipmentEvents(shipment.events, reader);
  return (
    <div className="border-t pt-4">
      <DotTimeline label="Histórico do envio">
        {shipmentTimeline(steps).map((event) => (
          <DotTimelineItem
            key={event.id}
            dotClassName={TONE_DOT_CLASSES[FULFILLMENT_TONES[event.status]]}
            date={event.createdAt}
          >
            <span className="block text-foreground">
              {shipmentStatusLabel(event.status, shipment.catalogKind)}
            </span>
            <span className="block text-muted-foreground">por {event.actor}</span>
            {event.note ? (
              <span className="block break-words text-muted-foreground">{event.note}</span>
            ) : null}
          </DotTimelineItem>
        ))}
      </DotTimeline>
    </div>
  );
}
