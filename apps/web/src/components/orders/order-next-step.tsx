import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  PaymentPill,
  type PaymentBadgeTone,
} from "@/components/supplier-payments/supplier-payment-badge";
import { fulfillmentQueryOptions } from "@/features/fulfillment/fulfillment.queries";
import {
  type NextStepAction,
  type NextStepTone,
  orderNextStep,
} from "@/features/orders/order-next-step";
import { useNow } from "@/hooks/use-now";

const PILL_TONES: Record<NextStepTone, PaymentBadgeTone> = {
  action: "warning",
  waiting: "neutral",
  done: "success",
  problem: "danger",
};

/** Where each action lands on the page: the forward form, a payment, or the shipping block. */
export function nextStepTargetId(action: NextStepAction): string {
  if (action.kind === "forward") {
    return "forward-form";
  }
  if (action.kind === "pay") {
    return `supplier-payment-${action.shipmentId}`;
  }
  return "order-shipping";
}

/** Brings the block into view and moves the keyboard there, so the next Tab is inside it. */
function goTo(action: NextStepAction): void {
  const target = document.getElementById(nextStepTargetId(action));
  if (target === null) {
    return;
  }
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  target.focus({ preventScroll: true });
}

function actionLabel(action: NextStepAction): string {
  if (action.kind === "forward") {
    return action.label;
  }
  if (action.kind === "pay") {
    return "Pagar o fornecedor";
  }
  return "Ver o envio";
}

/**
 * The order's next step, right under its heading: whether it waits for the reseller and what
 * comes after, without scrolling to the shipping block.
 */
export function OrderNextStep({ orderId }: { orderId: string }) {
  const query = useQuery(fulfillmentQueryOptions(orderId));
  const now = useNow();
  if (query.isPending) {
    return <Skeleton className="h-24 rounded-3xl" />;
  }
  if (query.isError) {
    // The shipping block below shows the error with its retry.
    return null;
  }
  const { order, items, shipments } = query.data;
  const step = orderNextStep({ orderStatus: order.status, items, shipments, now });
  return (
    <section
      aria-labelledby="order-next-step"
      className="surface-card flex flex-col gap-4 rounded-3xl bg-card p-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0 space-y-2">
        <h2 id="order-next-step" className="text-xs text-muted-foreground">
          Próximo passo
        </h2>
        <p>
          <PaymentPill tone={PILL_TONES[step.tone]}>{step.title}</PaymentPill>
        </p>
        {step.detail === null ? null : (
          <p className="text-sm text-pretty" suppressHydrationWarning>
            {step.detail}
          </p>
        )}
      </div>
      {step.action === null ? null : (
        <Button
          size="lg"
          variant={step.action.kind === "reforward" ? "outline" : "default"}
          className="w-full shrink-0 sm:w-auto"
          onClick={() => {
            if (step.action !== null) goTo(step.action);
          }}
        >
          {actionLabel(step.action)}
        </Button>
      )}
    </section>
  );
}
