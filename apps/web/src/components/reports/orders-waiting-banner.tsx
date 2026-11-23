import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PackageIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { attentionCountsQueryOptions } from "@/features/navigation/navigation.queries";
import { ordersToForwardTitle } from "./attention-items";

/**
 * Paid sales still waiting for the reseller to send them to the supplier, at the top of the
 * overview: the one thing that stops a sale, so it never sits below the charts.
 */
export function OrdersWaitingBanner() {
  const counts = useQuery(attentionCountsQueryOptions());
  const waiting = counts.data?.ordersToForward ?? 0;
  if (waiting === 0) {
    return null;
  }
  return (
    <section
      aria-labelledby="orders-waiting-title"
      className="surface-card flex flex-col gap-4 rounded-3xl bg-card p-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-800 dark:text-amber-300">
          <PackageIcon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="orders-waiting-title" className="font-medium">
            {ordersToForwardTitle(waiting)}
          </h2>
          <p className="text-sm text-muted-foreground">
            O comprador já pagou. O fornecedor só prepara depois que você envia o pedido.
          </p>
        </div>
      </div>
      <Button asChild size="lg" className="w-full shrink-0 sm:w-auto">
        <Link to="/pedidos" search={{ view: "operations", stage: "unforwarded" }}>
          Enviar agora
        </Link>
      </Button>
    </section>
  );
}
