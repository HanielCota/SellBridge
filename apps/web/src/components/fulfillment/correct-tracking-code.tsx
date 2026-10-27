import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { shipmentUpdateSchema } from "@sellbridge/shared/schemas";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";
import { Field } from "./shipment-field";

interface SentParcel {
  id: string;
  carrier: string | null;
  trackingCode: string;
  trackingUrl: string | null;
}

type ShipmentUpdateInput = ReturnType<typeof shipmentUpdateSchema.parse>;

function useCorrection(
  shipment: SentParcel,
  onUpdate: (input: ShipmentUpdateInput) => Promise<unknown>,
  onDone: () => void,
) {
  const [carrier, setCarrier] = useState(shipment.carrier ?? "");
  const [trackingCode, setTrackingCode] = useState(shipment.trackingCode);
  const [trackingUrl, setTrackingUrl] = useState(shipment.trackingUrl ?? "");
  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = shipmentUpdateSchema.safeParse({
        shipmentId: shipment.id,
        status: "shipped",
        carrier,
        trackingCode,
        trackingUrl,
        note: "",
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Confira os dados");
      if (parsed.data.trackingCode === shipment.trackingCode) {
        throw new Error("Digite o código novo, diferente do atual");
      }
      await onUpdate(parsed.data);
    },
    onSuccess: () => {
      onDone();
      toast.success("Código corrigido");
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
    mutation,
  };
}

type Correction = ReturnType<typeof useCorrection>;

function CorrectionFields({ correction }: { correction: Correction }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Transportadora" value={correction.carrier} onChange={correction.setCarrier} />
      <Field
        label="Código de rastreio correto"
        value={correction.trackingCode}
        onChange={correction.setTrackingCode}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
      />
      <div className="sm:col-span-2">
        <Field
          label="Link de rastreio (opcional)"
          value={correction.trackingUrl}
          onChange={correction.setTrackingUrl}
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
 * Fixes a wrong code on a parcel already sent. The server writes "Código corrigido de X para Y"
 * into the history, so whoever copied the old code sees that it changed.
 */
export function CorrectTrackingCode({
  shipment,
  onUpdate,
}: {
  shipment: SentParcel;
  onUpdate: (input: ShipmentUpdateInput) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const correction = useCorrection(shipment, onUpdate, () => setOpen(false));
  if (!open) {
    return (
      <Button variant="ghost" className="self-start" onClick={() => setOpen(true)}>
        Corrigir código
      </Button>
    );
  }
  return (
    <form
      className="space-y-3 rounded-2xl bg-muted/60 p-4"
      aria-label="Corrigir código de rastreio"
      onSubmit={(event) => {
        event.preventDefault();
        correction.mutation.mutate();
      }}
    >
      <CorrectionFields correction={correction} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={correction.mutation.isPending}>
          Salvar código
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
