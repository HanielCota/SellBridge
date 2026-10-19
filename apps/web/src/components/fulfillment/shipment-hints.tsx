import { FULFILLMENT_LABELS, type FulfillmentStatus } from "@sellbridge/shared/schemas";
import type { ReactElement } from "react";
import { ACTION_ICONS } from "@/components/icons/action-icons";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";

/**
 * The reseller's words for the shipment panel (docs/PLANO-UX-ICONES.md, section 4b). The supplier
 * works the same panel by link; its own wording waits for the supplier area's review, so every
 * helper here leaves the supplier's view as it was.
 */
export type ShipmentAction =
  | "printLabel"
  | "printOrder"
  | "supplierLink"
  | "revokeLink"
  | "occurrence"
  | "cancelShipment"
  | "advanceStep";

/** What pressing each step button does, said as the change it records. */
const STEP_HINTS: Partial<Record<FulfillmentStatus, string>> = {
  accepted: "Marca que o fornecedor aceitou o pedido",
  picking: "Marca que o fornecedor começou a separar o pedido",
  ready: "Marca que o pedido está embalado e pronto para despachar",
  shipped: "Marca que o pedido foi despachado; informe o rastreio",
  delivered: "Marca que o comprador recebeu o pedido",
};

/** "Marcar como aceito": the button names the action, not the state it leads to. */
export function stepButtonLabel(next: FulfillmentStatus, forReseller: boolean): string {
  if (!forReseller) {
    return FULFILLMENT_LABELS[next];
  }
  return `Marcar como ${FULFILLMENT_LABELS[next].toLowerCase()}`;
}

export function stepHint(next: FulfillmentStatus): string | undefined {
  return STEP_HINTS[next];
}

/** The button's icon, for the reseller only; null keeps the supplier's buttons as they were. */
export function ShipmentActionIcon({
  action,
  forReseller,
}: {
  action: ShipmentAction;
  forReseller: boolean;
}) {
  if (!forReseller) {
    return null;
  }
  const Icon = ACTION_ICONS[action].icon;
  return <Icon aria-hidden="true" />;
}

/** The action's legend for the reseller; the supplier's buttons render bare. */
export function ShipmentActionHint({
  action,
  forReseller,
  label,
  children,
}: {
  action: ShipmentAction;
  forReseller: boolean;
  /** Overrides the dictionary text (the step button says which step it records). */
  label?: string | undefined;
  children: ReactElement;
}) {
  const hint = label ?? ACTION_ICONS[action].hint;
  return (
    <Hint label={forReseller ? hint : undefined} openOnTap={false}>
      {children}
    </Hint>
  );
}

/** Records the next step; for the reseller it reads "Marcar como …" and explains itself. */
export function StepButton({
  next,
  forReseller,
  disabled,
  onAdvance,
}: {
  next: FulfillmentStatus;
  forReseller: boolean;
  disabled: boolean;
  onAdvance: () => void;
}) {
  return (
    <ShipmentActionHint action="advanceStep" forReseller={forReseller} label={stepHint(next)}>
      <Button disabled={disabled} onClick={onAdvance}>
        <ShipmentActionIcon action="advanceStep" forReseller={forReseller} />
        {stepButtonLabel(next, forReseller)}
      </Button>
    </ShipmentActionHint>
  );
}
