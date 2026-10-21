import {
  FULFILLMENT_LABELS,
  type FulfillmentStatus,
  type ShipmentOperator,
} from "@sellbridge/shared/schemas";
import type { ReactElement } from "react";
import { ACTION_ICONS } from "@/components/icons/action-icons";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";

/**
 * Words and icons for the shipment panel (docs/PLANO-UX-ICONES.md, sections 4b and fornecedor 2).
 * The reseller and the supplier work the same panel; the legends speak to whoever is operating.
 */
export type ShipmentAction =
  | "printLabel"
  | "printOrder"
  | "supplierLink"
  | "revokeLink"
  | "occurrence"
  | "cancelShipment"
  | "advanceStep";

/** What pressing each step button records, said to whoever presses it. */
const STEP_HINTS: Record<ShipmentOperator, Partial<Record<FulfillmentStatus, string>>> = {
  reseller: {
    accepted: "Marca que o fornecedor aceitou o pedido",
    picking: "Marca que o fornecedor começou a separar o pedido",
    ready: "Marca que o pedido está embalado e pronto para despachar",
    shipped: "Marca que o pedido foi despachado; informe o rastreio",
    delivered: "Marca que o comprador recebeu o pedido",
  },
  supplier: {
    accepted: "Confirma que você vai atender este pedido",
    picking: "Marca que você começou a separar o pedido",
    ready: "Marca que o pedido está embalado e pronto para despachar",
    shipped: "Marca que você despachou o pedido; informe o rastreio",
  },
};

/** The supplier's own words where the reseller's legend talks about the supplier. */
const SUPPLIER_HINTS: Partial<Record<ShipmentAction, string>> = {
  printOrder: "Imprime a lista do que você deve separar e enviar",
  cancelShipment: "Devolve o pedido ao revendedor; não dá para desfazer",
};

/** "Marcar como aceito": the button names the action, not the state it leads to. */
export function stepButtonLabel(next: FulfillmentStatus): string {
  return `Marcar como ${FULFILLMENT_LABELS[next].toLowerCase()}`;
}

export function stepHint(next: FulfillmentStatus, operator: ShipmentOperator): string | undefined {
  return STEP_HINTS[operator][next];
}

export function ShipmentActionIcon({ action }: { action: ShipmentAction }) {
  const Icon = ACTION_ICONS[action].icon;
  return <Icon aria-hidden="true" />;
}

export function ShipmentActionHint({
  action,
  operator,
  label,
  children,
}: {
  action: ShipmentAction;
  operator: ShipmentOperator;
  /** Overrides the dictionary text (the step button says which step it records). */
  label?: string | undefined;
  children: ReactElement;
}) {
  const own = operator === "supplier" ? SUPPLIER_HINTS[action] : undefined;
  return (
    <Hint label={label ?? own ?? ACTION_ICONS[action].hint} openOnTap={false}>
      {children}
    </Hint>
  );
}

/** Records the next step; it reads "Marcar como …" and explains itself. */
export function StepButton({
  next,
  operator,
  disabled,
  onAdvance,
}: {
  next: FulfillmentStatus;
  operator: ShipmentOperator;
  disabled: boolean;
  onAdvance: () => void;
}) {
  return (
    <ShipmentActionHint action="advanceStep" operator={operator} label={stepHint(next, operator)}>
      <Button disabled={disabled} onClick={onAdvance}>
        <ShipmentActionIcon action="advanceStep" />
        {stepButtonLabel(next)}
      </Button>
    </ShipmentActionHint>
  );
}
