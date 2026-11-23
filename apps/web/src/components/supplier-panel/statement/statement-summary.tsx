import { formatCents } from "@sellbridge/shared/money";
import type { StatementTotals } from "@sellbridge/shared/supplier-statement";

function ordersWord(count: number): string {
  return count === 1 ? "1 pedido" : `${count} pedidos`;
}

function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}

/** What the supplier receives in the period first, then how that number is made. */
export function StatementSummary({ totals }: { totals: StatementTotals }) {
  const asaasPrefix = totals.asaasFeeEstimated ? "cerca de " : "";
  return (
    <section
      aria-labelledby="statement-summary-title"
      className="surface-card max-w-3xl space-y-5 rounded-3xl bg-card p-5 sm:p-6"
    >
      <div className="space-y-1">
        <h2 id="statement-summary-title" className="text-sm text-muted-foreground">
          Você recebe · {ordersWord(totals.orders)} pagos
        </h2>
        <p className="text-3xl font-semibold tracking-tight tabular-nums">
          {formatCents(totals.netCents)}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-emerald-500/10 p-3">
          <p className="text-xs text-muted-foreground">Já liberado</p>
          <p className="text-lg font-semibold tabular-nums">
            {formatCents(totals.releasedNetCents)}
          </p>
        </div>
        <div className="rounded-2xl bg-muted p-3">
          <p className="text-xs text-muted-foreground">Guardado até a entrega</p>
          <p className="text-lg font-semibold tabular-nums">{formatCents(totals.heldNetCents)}</p>
        </div>
      </div>
      <dl className="divide-y divide-border/60">
        <BreakdownRow
          label="Vendido (seus produtos, sem frete)"
          value={formatCents(totals.soldCents)}
        />
        <BreakdownRow
          label="4% do SellBridge"
          value={`− ${formatCents(totals.platformFeeCents)}`}
        />
        <BreakdownRow
          label="Tarifa do Asaas"
          value={`− ${asaasPrefix}${formatCents(totals.asaasFeeCents)}`}
        />
      </dl>
      {totals.returnedOrders === 0 ? null : (
        <p className="text-sm text-muted-foreground">
          {ordersWord(totals.returnedOrders)} ({formatCents(totals.returnedCents)}){" "}
          {totals.returnedOrders === 1 ? "voltou" : "voltaram"} para o revendedor e não{" "}
          {totals.returnedOrders === 1 ? "entra" : "entram"} nessa conta.
        </p>
      )}
    </section>
  );
}
