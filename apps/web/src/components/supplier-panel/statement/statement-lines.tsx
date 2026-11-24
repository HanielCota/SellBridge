import { formatCents } from "@sellbridge/shared/money";
import { PaymentPill } from "@/components/supplier-payments/supplier-payment-badge";
import { statementSituationPill } from "@/features/supplier-panel/statement/statement-text";
import type { StatementLineView } from "@/features/supplier-panel/statement/statement-view";
import { formatShortDate } from "@/lib/relative-time";

function Amount({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={strong ? "font-semibold tabular-nums" : "tabular-nums"}>{value}</dd>
    </div>
  );
}

function asaasFeeText(line: StatementLineView): string {
  if (line.asaasFeeCents === null) {
    return "—";
  }
  const prefix = line.asaasFeeEstimated ? "cerca de " : "";
  return `− ${prefix}${formatCents(line.asaasFeeCents)}`;
}

function StatementLineItem({ line }: { line: StatementLineView }) {
  const pill = statementSituationPill(line.situation);
  const returned = line.bucket === "returned";
  return (
    <li className="surface-card space-y-3 rounded-2xl bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium break-words">{line.itemsLabel}</p>
          <p className="text-xs text-muted-foreground">
            Pedido {line.externalOrderId} · pago em {formatShortDate(line.paidAt)}
          </p>
        </div>
        <PaymentPill tone={pill.tone}>{pill.text}</PaymentPill>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <Amount label="Vendido" value={formatCents(line.soldCents)} />
        <Amount
          label="4% do SellBridge"
          value={returned ? "—" : `− ${formatCents(line.platformFeeCents)}`}
        />
        <Amount label="Tarifa do Asaas" value={asaasFeeText(line)} />
        <Amount label="Você recebe" value={formatCents(line.netCents)} strong />
      </dl>
    </li>
  );
}

/** The period's paid parcels, newest payment first. */
export function StatementLines({ lines }: { lines: readonly StatementLineView[] }) {
  return (
    <ul className="max-w-3xl space-y-3" aria-label="Pedidos pagos">
      {lines.map((line) => (
        <StatementLineItem key={line.id} line={line} />
      ))}
    </ul>
  );
}
