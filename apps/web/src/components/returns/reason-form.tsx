import type { OrderReturnView } from "@sellbridge/database/repositories";
import {
  RETURN_REASON_LABELS,
  RETURN_REASONS,
  RETURN_SHIPPING_MAX_CENTS,
  REASON_NOTE_MAX,
  reasonNeedsPhotos,
  type ReturnReason,
} from "@sellbridge/shared/return-policy";
import { formatCents, parseBrlToCents } from "@sellbridge/shared/money";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { postMultipart } from "@/features/support/upload";
import { formatCentsForField, maskCurrencyInput } from "@/lib/currency-mask";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { appendPhotos, ReturnPhotoPicker, useReturnPhotoPicker } from "./return-photos";

/** Why the typed return label cannot be sent, or null when it can (blank is fine). */
function shippingProblem(typed: string): string | null {
  if (typed.trim() === "") {
    return null;
  }
  const cents = parseBrlToCents(typed);
  if (cents === null || cents < 0) {
    return `Confira o valor: "${typed}" não é um valor em reais. Exemplo: 22,90`;
  }
  if (cents > RETURN_SHIPPING_MAX_CENTS) {
    return `O frete vai até ${formatCents(RETURN_SHIPPING_MAX_CENTS)}. Confira o valor.`;
  }
  return null;
}

function ReasonChoice({
  value,
  onChange,
}: {
  value: ReturnReason | null;
  onChange: (reason: ReturnReason) => void;
}) {
  const name = useId();
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">Por que o comprador devolveu?</legend>
      {RETURN_REASONS.map((reason) => (
        <label
          key={reason}
          className={cn(
            "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border px-3.5 text-sm",
            value === reason && "border-foreground bg-muted",
          )}
        >
          <input
            type="radio"
            name={name}
            value={reason}
            checked={value === reason}
            onChange={() => onChange(reason)}
            className="size-4 accent-foreground"
          />
          {RETURN_REASON_LABELS[reason]}
        </label>
      ))}
    </fieldset>
  );
}

function ShippingField({
  typed,
  problem,
  onType,
}: {
  typed: string;
  problem: string | null;
  onType: (value: string) => void;
}) {
  const fieldId = useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium">
        Quanto o Mercado Livre cobrou pelo frete de volta?{" "}
        <span className="font-normal text-muted-foreground">(opcional)</span>
      </label>
      <div
        className={cn(
          "flex h-11 items-center gap-2 rounded-xl border border-field-border bg-field px-3.5 sm:max-w-xs focus-within:border-brand-strong focus-within:ring-4 focus-within:ring-brand/20",
          problem !== null && "border-destructive",
        )}
      >
        <span className="text-body text-muted-foreground">R$</span>
        <input
          id={fieldId}
          inputMode="numeric"
          autoComplete="off"
          placeholder="22,90"
          value={typed}
          aria-invalid={problem !== null}
          aria-describedby={`${fieldId}-hint`}
          onChange={(event) => onType(maskCurrencyInput(event.currentTarget.value))}
          className="min-w-0 flex-1 bg-transparent text-body tabular-nums outline-none"
        />
      </div>
      <p
        id={`${fieldId}-hint`}
        aria-live="polite"
        className={cn(
          "text-footnote",
          problem === null ? "text-muted-foreground" : "text-destructive",
        )}
      >
        {problem ??
          "Deixe em branco se não souber. Em defeito, avaria ou produto errado, o fornecedor paga esse frete."}
      </p>
    </div>
  );
}

function useSendReason(claim: OrderReturnView, orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (formData: FormData) =>
      postMultipart(`/api/devolucoes/${claim.claimId}/motivo`, formData),
    onSuccess: async () => {
      toast.success("Motivo enviado ao fornecedor");
      await queryClient.invalidateQueries({ queryKey: ["order-returns", orderId] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

function NoteField({ note, onChange }: { note: string; onChange: (note: string) => void }) {
  const noteId = useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={noteId} className="text-sm font-medium">
        O que o comprador disse?{" "}
        <span className="font-normal text-muted-foreground">(opcional)</span>
      </label>
      <Textarea
        id={noteId}
        value={note}
        maxLength={REASON_NOTE_MAX}
        placeholder="Ex.: a costura da manga veio aberta."
        onChange={(event) => onChange(event.currentTarget.value)}
        className="min-h-20"
      />
    </div>
  );
}

/** Why the button is off, in a line under it; null when it can be sent. */
function submitHint(reason: ReturnReason | null, missingPhotos: boolean): string | null {
  if (reason === null) {
    return "Escolha o motivo para enviar.";
  }
  if (missingPhotos) {
    return `Para ${RETURN_REASON_LABELS[reason].toLowerCase()}, mande ao menos uma foto.`;
  }
  return null;
}

/** The form's fields, filled again with what was sent so a correction never starts blank. */
function useReasonFields(claim: OrderReturnView) {
  const [reason, setReason] = useState<ReturnReason | null>(claim.policy.reason);
  const [note, setNote] = useState(claim.policy.reasonNote ?? "");
  const [shipping, setShipping] = useState(
    claim.policy.returnShippingCents === null
      ? ""
      : formatCentsForField(claim.policy.returnShippingCents),
  );
  const picker = useReturnPhotoPicker();
  const hasSellerPhotos = claim.policy.photos.some((photo) => photo.side === "seller");
  const photosRequired = reason !== null && reasonNeedsPhotos(reason) && !hasSellerPhotos;
  return {
    reason,
    setReason,
    note,
    setNote,
    shipping,
    setShipping,
    picker,
    photosRequired,
    missingPhotos: photosRequired && picker.files.length === 0,
    shippingProblem: shippingProblem(shipping),
  };
}

/** The reseller tells why the buyer sent the parcel back, with photos when the supplier is to blame. */
export function ReasonForm({
  claim,
  orderId,
  primary,
}: {
  claim: OrderReturnView;
  orderId: string;
  /** False when another action on the card is the main one. */
  primary: boolean;
}) {
  const fields = useReasonFields(claim);
  const send = useSendReason(claim, orderId);
  const hint = submitHint(fields.reason, fields.missingPhotos);
  const blocked = hint !== null || fields.shippingProblem !== null || send.isPending;
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (blocked || fields.reason === null) {
          return;
        }
        const formData = new FormData();
        formData.set("reason", fields.reason);
        formData.set("note", fields.note);
        formData.set("returnShipping", fields.shipping);
        appendPhotos(formData, fields.picker.files);
        send.mutate(formData);
      }}
    >
      <ReasonChoice value={fields.reason} onChange={fields.setReason} />
      <NoteField note={fields.note} onChange={fields.setNote} />
      <ShippingField
        typed={fields.shipping}
        problem={fields.shippingProblem}
        onType={fields.setShipping}
      />
      <ReturnPhotoPicker
        picker={fields.picker}
        label="Fotos do problema"
        hint="As fotos que o comprador mandou no Mercado Livre, ou do produto, mostrando o defeito ou a troca."
        required={fields.photosRequired}
      />
      <div className="grid gap-1.5">
        <div>
          <Button
            type="submit"
            size="lg"
            variant={primary ? "default" : "outline"}
            disabled={blocked}
          >
            {send.isPending ? "Enviando…" : "Enviar motivo"}
          </Button>
        </div>
        {hint === null ? null : <p className="text-footnote text-muted-foreground">{hint}</p>}
      </div>
    </form>
  );
}
