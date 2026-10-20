import { useState } from "react";
import type { FulfillmentStatus } from "@sellbridge/shared/schemas";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Field } from "./shipment-field";
import type { ShipmentUpdate, ShipmentView } from "./shipment-panel";

const STEP_LABELS: Partial<Record<FulfillmentStatus, string>> = {
  picking: "Start picking",
  ready: "Mark ready to ship",
  shipped: "Record shipment",
  delivered: "Confirm delivery",
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
      <Field label="Shipment note" value={update.note} onChange={update.setNote} />
      <div className="flex flex-wrap gap-2">
        {next ? (
          <Button
            disabled={update.mutation.isPending}
            onClick={() => update.mutation.mutate({ status: next, note: update.note })}
          >
            {STEP_LABELS[next] ?? "Continue preparation"}
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
      <Field label="Carrier" value={update.carrier} onChange={update.setCarrier} />
      <Field
        label="Tracking code"
        value={update.trackingCode}
        onChange={update.setTrackingCode}
        autoCorrect="off"
        spellCheck={false}
      />
      <div className="sm:col-span-2">
        <Field
          label="Tracking URL (optional)"
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
      setError("Enter a reason for stopping preparation");
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
        Stop preparation
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Stop your shipment preparation?"
        description="The order still needs these items. Restart preparation when ready, or cancel and refund the order in the marketplace. This action does not cancel the buyer's order."
        confirmLabel="Stop preparation"
        pendingLabel="Stopping…"
        cancelLabel="Keep preparing"
        destructive
        isPending={update.mutation.isPending}
        onConfirm={confirm}
      >
        <Field
          label="Reason"
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
