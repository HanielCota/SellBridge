import {
  SUPPLIER_LABEL_STATE_LABELS,
  type SupplierLabelState,
} from "@sellbridge/shared/supplier-order-labels";
import {
  SUPPLIER_ORDER_PROBLEM_HINTS,
  SUPPLIER_ORDER_PROBLEM_LABELS,
} from "@sellbridge/shared/supplier-panel-orders-tabs";
import { type StatusTone, ToneStatus, TonePill } from "@/components/data/tone-status";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { isShippingBlocked } from "@/features/fulfillment/shipping-block";
import {
  FULFILLMENT_TONES,
  supplierShipmentStatusLabel,
} from "@/features/fulfillment/shipment-timeline";
import { displayBuyerName } from "@/features/orders/buyer-name";
import { formatAbsoluteTime } from "@/lib/relative-time";
import type { SupplierOrderRow } from "@/features/supplier-panel/orders/use-order-actions";
import { CONTROL_HINTS, SUPPLIER_NEXT_STEP_HINTS } from "@/components/icons/action-icons";
import { Hint } from "@/components/ui/hint";
import { ChannelLine } from "./channel-line";
import { SupplierPaymentBadgeView } from "@/components/supplier-payments/supplier-payment-badge";

/** "2× Camiseta (CAM-01) e mais 1 item": enough to pick the parcel without opening it. */
export function itemsSummary(items: SupplierOrderRow["items"]): string {
  const [first, ...rest] = items;
  if (first === undefined) {
    return "Sem itens";
  }
  const sku = first.sku === "" ? "" : ` (${first.sku})`;
  const head = `${first.quantity}× ${first.title}${sku}`;
  if (rest.length === 0) {
    return head;
  }
  return `${head} e mais ${rest.length} ${rest.length === 1 ? "item" : "itens"}`;
}

/** The order number, who sold and bought it, the items and where it goes: the row's main text. */
export function OrderSummary({
  row,
  onOpen,
}: {
  row: SupplierOrderRow;
  onOpen: (row: SupplierOrderRow) => void;
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <button
        type="button"
        onClick={() => onOpen(row)}
        className="max-w-full rounded-sm text-left font-semibold break-all underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Pedido {row.externalOrderId}
      </button>
      {row.supplierPayment === undefined ? null : (
        <div>
          <SupplierPaymentBadgeView badge={row.supplierPayment} />
        </div>
      )}
      <ChannelLine marketplace={row.marketplace} logisticType={row.marketplaceLogisticType} />
      <p className="truncate text-footnote">
        {row.shopName} · {displayBuyerName(row.buyerName)}
      </p>
      <p className="truncate text-footnote text-muted-foreground">{itemsSummary(row.items)}</p>
      <p className="text-caption text-muted-foreground">
        {row.destinationCity}, {row.destinationState}
      </p>
    </div>
  );
}

export function StepStatus({ row }: { row: SupplierOrderRow }) {
  return (
    <TonePill
      tone={FULFILLMENT_TONES[row.status]}
      label={supplierShipmentStatusLabel(row.status)}
    />
  );
}

const LABEL_TONES: Record<SupplierLabelState, StatusTone> = {
  waiting: "info",
  pending: "warning",
  late: "danger",
  printed: "success",
};

/** The marketplace label's state; a printed one says when it was last emitted. */
export function LabelStatus({
  state,
  printedAt,
}: {
  state: SupplierLabelState | null;
  printedAt: Date | null;
}) {
  if (state === null) {
    return null;
  }
  const when = state === "printed" && printedAt !== null ? ` ${formatAbsoluteTime(printedAt)}` : "";
  // A line of its own: on a phone the row's action button follows it.
  return (
    <div>
      <TonePill tone={LABEL_TONES[state]} label={`${SUPPLIER_LABEL_STATE_LABELS[state]}${when}`} />
    </div>
  );
}

/** Each problem with what to do about it, never a bare red mark. */
export function ProblemList({ row }: { row: SupplierOrderRow }) {
  if (row.problems.length === 0) {
    return null;
  }
  return (
    <ul className="space-y-1">
      {row.problems.map((problem) => (
        <li key={problem} className="text-footnote">
          <ToneStatus
            tone={problem === "email_failed" ? "warning" : "danger"}
            label={SUPPLIER_ORDER_PROBLEM_LABELS[problem]}
          />
          <p className="pl-3 text-caption text-muted-foreground">
            {SUPPLIER_ORDER_PROBLEM_HINTS[problem]}
          </p>
        </li>
      ))}
    </ul>
  );
}

/**
 * The row's one primary action. Accept, picking and ready are one click; shipping asks for the
 * tracking, so it opens the panel. A sale not released for shipping offers none: its reason says
 * to hold it, and the order number still opens the panel.
 */
export function RowAction({
  row,
  pending,
  onAdvance,
  onOpen,
}: {
  row: SupplierOrderRow;
  pending: boolean;
  onAdvance: (row: SupplierOrderRow) => void;
  onOpen: (row: SupplierOrderRow) => void;
}) {
  const action = row.action;
  if (isShippingBlocked(row.orderStatus)) {
    return null;
  }
  if (action === null) {
    return (
      <Hint label={CONTROL_HINTS.viewOrder} openOnTap={false}>
        <Button size="sm" variant="outline" onClick={() => onOpen(row)}>
          Ver pedido
        </Button>
      </Hint>
    );
  }
  if (action.needsTracking) {
    return (
      <Hint label={SUPPLIER_NEXT_STEP_HINTS[action.status]} openOnTap={false}>
        <Button size="sm" onClick={() => onOpen(row)}>
          {action.label}
        </Button>
      </Hint>
    );
  }
  return (
    <Hint label={SUPPLIER_NEXT_STEP_HINTS[action.status]} openOnTap={false}>
      <Button size="sm" disabled={pending} onClick={() => onAdvance(row)}>
        {pending ? "Salvando…" : action.label}
      </Button>
    </Hint>
  );
}

/** Only parcels waiting for the accept can join a batch accept. */
export function isBatchAcceptable(row: SupplierOrderRow): boolean {
  return row.status === "forwarded" && !isShippingBlocked(row.orderStatus);
}

/** Parcels whose marketplace label can still be emitted can join a batch print. */
export function isLabelPrintable(row: SupplierOrderRow): boolean {
  return row.labelState !== null && !isShippingBlocked(row.orderStatus);
}

/** A row with any batch action: accept, or print its label. */
export function isBatchSelectable(row: SupplierOrderRow): boolean {
  return isBatchAcceptable(row) || isLabelPrintable(row);
}

export function RowCheckbox({
  row,
  checked,
  onToggle,
}: {
  row: SupplierOrderRow;
  checked: boolean;
  onToggle: (row: SupplierOrderRow) => void;
}) {
  if (!isBatchSelectable(row)) {
    return <span className="block size-4" aria-hidden="true" />;
  }
  return (
    <Hint label={CONTROL_HINTS.batchAccept} openOnTap={false}>
      <Checkbox
        checked={checked}
        onCheckedChange={() => onToggle(row)}
        aria-label={`Selecionar pedido ${row.externalOrderId}`}
      />
    </Hint>
  );
}
