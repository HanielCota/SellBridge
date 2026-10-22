import {
  SHIPMENT_EVENTS_FULL,
  SHIPMENT_EVENTS_LIMIT,
  shipmentUpdateSchema,
  type ShipmentOperator,
} from "@sellbridge/shared/schemas";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { SmartDate } from "@/components/data/smart-date";
import { FormErrorAlert } from "@/components/form/form-feedback";
import { TextareaField } from "@/components/form/textarea-field";
import { Button } from "@/components/ui/button";
import { contactWarning } from "@/features/fulfillment/contact-warning";
import { splitShipmentEvents, type OrderMessage } from "@/features/fulfillment/order-messages";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { ShipmentView } from "./shipment-panel";

type ShipmentUpdateInput = ReturnType<typeof shipmentUpdateSchema.parse>;

const OTHER_SIDE: Record<ShipmentOperator, string> = {
  reseller: "o fornecedor",
  supplier: "o revendedor",
};
const EMPTY_MESSAGE = "Escreva a mensagem antes de enviar";

function MessageList({ messages, reader }: { messages: OrderMessage[]; reader: ShipmentOperator }) {
  if (messages.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma mensagem ainda. Combine aqui os detalhes do pedido com {OTHER_SIDE[reader]}.
      </p>
    );
  }
  return (
    <ol className="space-y-2">
      {messages.map((message) => (
        <li
          key={message.id}
          className={cn(
            "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm",
            message.author === "Você" ? "ml-auto bg-brand/10" : "bg-muted",
          )}
        >
          <p className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{message.author}</span>
            <SmartDate date={new Date(message.createdAt)} />
          </p>
          <p className="mt-0.5 break-words whitespace-pre-wrap">{message.text}</p>
        </li>
      ))}
    </ol>
  );
}

function useSendMessage(
  shipment: ShipmentView,
  onUpdate: (input: ShipmentUpdateInput) => Promise<unknown>,
) {
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async (note: string) => {
      // Same status as now: the server keeps it as a note, never as a step.
      const parsed = shipmentUpdateSchema.safeParse({
        shipmentId: shipment.id,
        status: shipment.status,
        carrier: shipment.carrier ?? "",
        trackingCode: shipment.trackingCode ?? "",
        trackingUrl: shipment.trackingUrl ?? "",
        note,
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? EMPTY_MESSAGE);
      await onUpdate(parsed.data);
    },
    onSuccess: () => {
      setText("");
      toast.success("Mensagem enviada");
    },
    // The text stays in the field, so a refused message can be fixed and sent again.
    onError: (error) => setProblem(errorMessage(error)),
  });
  function send() {
    if (text.trim() === "") {
      setProblem(EMPTY_MESSAGE);
      return;
    }
    // Same detector as the server, which refuses and records it anyway: a contact never leaves.
    const contact = contactWarning(text);
    if (contact !== null) {
      setProblem(contact);
      return;
    }
    setProblem(null);
    mutation.mutate(text);
  }
  return { text, setText, problem, setProblem, send, isSending: mutation.isPending };
}

/**
 * The conversation between the store and the supplier about one parcel, on every screen that
 * shows the parcel. Phone numbers, e-mails and social handles are refused by the server.
 */
export function OrderMessages({
  shipment,
  reader,
  canWrite,
  onUpdate,
}: {
  shipment: ShipmentView;
  reader: ShipmentOperator;
  /** False once the parcel is settled: the conversation stays readable. */
  canWrite: boolean;
  onUpdate: (input: ShipmentUpdateInput) => Promise<unknown>;
}) {
  const { messages } = splitShipmentEvents(shipment.events, reader);
  const draft = useSendMessage(shipment, onUpdate);
  const isFull = shipment.events.length >= SHIPMENT_EVENTS_LIMIT;
  return (
    <section aria-labelledby={`messages-${shipment.id}`} className="space-y-3 border-t pt-4">
      <h3 id={`messages-${shipment.id}`} className="text-sm font-semibold">
        Mensagens do pedido
      </h3>
      <MessageList messages={messages} reader={reader} />
      {isFull ? <p className="text-sm text-muted-foreground">{SHIPMENT_EVENTS_FULL}</p> : null}
      {canWrite && !isFull ? (
        <div className="space-y-2">
          <FormErrorAlert message={draft.problem} />
          <TextareaField
            id={`message-${shipment.id}`}
            label={`Mensagem para ${OTHER_SIDE[reader]}`}
            rows={3}
            value={draft.text}
            errors={[]}
            onValueChange={(value) => {
              draft.setText(value);
              draft.setProblem(null);
            }}
          />
          <p className="text-xs text-muted-foreground">
            Telefone, e-mail e redes sociais não podem ser enviados: a conversa fica aqui.
          </p>
          <Button type="button" variant="outline" disabled={draft.isSending} onClick={draft.send}>
            {draft.isSending ? "Enviando…" : "Enviar mensagem"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
