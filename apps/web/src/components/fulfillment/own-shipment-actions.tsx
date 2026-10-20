import { useState } from "react";
import type { FulfillmentStatus } from "@sellbridge/shared/schemas";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Field } from "./shipment-field";
import type { ShipmentUpdate, ShipmentView } from "./shipment-panel";

const STEP_LABELS: Partial<Record<FulfillmentStatus, string>> = {
  picking: "Iniciar separação",
  ready: "Marcar como pronto para envio",
  shipped: "Registrar envio",
  delivered: "Confirmar entrega",
};

export function OwnShipmentActions({
  update,
  shipment,
  next,
}: {
  update: ShipmentUpdate;
  shipment: ShipmentView;
  next: FulfillmentStatus | null;
}) {
  return (
    <div className="space-y-3">
      {next === "shipped" ? <OwnDispatchFields update={update} /> : null}
      <Field label="Observação do envio" value={update.note} onChange={update.setNote} />
      <div className="flex flex-wrap gap-2">
        {next ? (
          <Button
            disabled={update.mutation.isPending}
            onClick={() => update.mutation.mutate({ status: next, note: update.note })}
          >
            {STEP_LABELS[next] ?? "Continuar preparação"}
          </Button>
        ) : null}
        {next && shipment.status !== "shipped" ? <StopPreparation update={update} /> : null}
      </div>
    </div>
  );
}

function OwnDispatchFields({ update }: { update: ShipmentUpdate }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Transportadora" value={update.carrier} onChange={update.setCarrier} />
      <Field
        label="Código de rastreio"
        value={update.trackingCode}
        onChange={update.setTrackingCode}
        autoCorrect="off"
        spellCheck={false}
      />
      <div className="sm:col-span-2">
        <Field
          label="Link de rastreio (opcional)"
          value={update.trackingUrl}
          onChange={update.setTrackingUrl}
          type="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>
    </div>
  );
}

function StopPreparation({ update }: { update: ShipmentUpdate }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  function confirm() {
    if (!reason.trim()) {
      setError("Informe o motivo para interromper a preparação");
      return;
    }
    update.mutation.mutate(
      { status: "cancelled", note: reason },
      { onSuccess: () => setOpen(false) },
    );
  }
  return (
    <>
      <Button
        variant="destructive"
        disabled={update.mutation.isPending}
        onClick={() => {
          setReason(update.note);
          setError(null);
          setOpen(true);
        }}
      >
        Interromper preparação
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Interromper a preparação do seu envio?"
        description="O pedido ainda precisa destes itens. Retome a preparação quando puder ou cancele e reembolse o pedido no marketplace. Esta ação não cancela o pedido do comprador."
        confirmLabel="Interromper preparação"
        pendingLabel="Interrompendo…"
        cancelLabel="Continuar preparando"
        destructive
        isPending={update.mutation.isPending}
        onConfirm={confirm}
      >
        <Field
          label="Motivo"
          value={reason}
          error={error}
          maxLength={500}
          onChange={(value) => {
            setReason(value);
            setError(null);
          }}
        />
      </ConfirmDialog>
    </>
  );
}
