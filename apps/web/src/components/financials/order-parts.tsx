import type { OrderFinancialRow } from "@sellbridge/database/repositories";
import type { OrderFinance } from "@sellbridge/shared/finance";
import { formatCents } from "@sellbridge/shared/money";
import { orderMargin, orderSplit, type OrderSplitKind } from "@/features/reports/financial-rows";
import { PENDING_COST_HINT, PENDING_HATCH_CLASS } from "@/components/reports/pending-cost";
import { formatPercent } from "@/lib/percent";
import { cn } from "@/lib/utils";
import { TERM_HINTS } from "@/components/icons/action-icons";
import { HintedText } from "@/components/ui/hint";

/** Same colors as the period summary, so a row's bar reads like the big one above it. */
const SPLIT_COLORS: Record<OrderSplitKind, string> = {
  pending: PENDING_HATCH_CLASS,
  cost: "bg-finance-cost",
  fee: "bg-finance-fee",
  refund: "bg-finance-refund",
  profit: "bg-brand-mark",
};

const SPLIT_LABELS: Record<OrderSplitKind, string> = {
  pending: "Custo pendente",
  cost: "Produtos",
  fee: "Taxas",
  refund: "Reembolso",
  profit: "Lucro",
};

/** Money with a real minus sign, and a plus when asked, so columns read as math. */
export function signedCents(cents: number, { plus = false } = {}): string {
  if (cents < 0) {
    return `−${formatCents(-cents)}`;
  }
  return plus && cents > 0 ? `+${formatCents(cents)}` : formatCents(cents);
}

export function marginLabel(row: OrderFinancialRow): string | null {
  const margin = orderMargin(row);
  return margin === null ? null : formatPercent(margin);
}

/** The order is out of the books (unpaid, cancelled or returned): its amounts read as void. */
export function isVoidOrder(row: OrderFinancialRow): boolean {
  return row.status === "pending" || row.status === "cancelled" || row.status === "returned";
}

/**
 * One thin bar split into where the sale went, spelled out on hover. Decorative for assistive
 * tech: it always sits beside the breakdown that says the same thing in words.
 */
export function OrderSplitBar({ row, className }: { row: OrderFinancialRow; className?: string }) {
  const parts = orderSplit(row);
  const total = parts.reduce((sum, part) => sum + part.cents, 0);
  if (total === 0) {
    return (
      <span aria-hidden="true" className={cn("block h-1.5 rounded-full bg-muted", className)} />
    );
  }
  const description = parts
    .map((part) => `${SPLIT_LABELS[part.kind]} ${formatCents(part.cents)}`)
    .join(" · ");
  return (
    <span
      aria-hidden="true"
      title={description}
      className={cn("flex h-1.5 gap-px overflow-hidden rounded-full", className)}
    >
      {parts.map((part) => (
        <span
          key={part.kind}
          className={cn("h-full min-w-1", SPLIT_COLORS[part.kind])}
          style={{ width: `${(part.cents / total) * 100}%` }}
        />
      ))}
    </span>
  );
}

interface BreakdownEntry {
  label: string;
  cents: number;
  color?: string;
}

function breakdownEntries(row: OrderFinance): BreakdownEntry[] {
  const entries: BreakdownEntry[] = [
    { label: "Produtos", cents: -row.costCents, color: SPLIT_COLORS.cost },
    { label: "Taxas", cents: -(row.feeCents + row.platformFeeCents), color: SPLIT_COLORS.fee },
    { label: "Reembolso", cents: -row.refundCents, color: SPLIT_COLORS.refund },
    { label: "Comissão", cents: row.commissionCents, color: SPLIT_COLORS.profit },
  ];
  return entries.filter((entry) => entry.cents !== 0);
}

/** A sale of unknown cost: the revenue, the products' cost that is missing, and no profit yet. */
function PendingCostBreakdown({ row }: { row: OrderFinance }) {
  return (
    <div className="grid gap-2">
      <dl className="grid gap-1.5 text-footnote">
        <div className="flex justify-between gap-4">
          <dt className="font-medium">Receita</dt>
          <dd className="font-medium tabular-nums">{formatCents(row.revenueCents)}</dd>
        </div>
        <div className="flex justify-between gap-4 text-muted-foreground">
          <dt className="flex items-center gap-2">
            <span aria-hidden="true" className={cn("size-2 rounded-[3px]", PENDING_HATCH_CLASS)} />
            Produtos
          </dt>
          <dd>custo pendente</dd>
        </div>
        <div className="mt-1 flex justify-between gap-4 border-t border-border pt-2">
          <dt className="font-medium">Lucro</dt>
          <dd className="font-medium text-muted-foreground">fora do lucro</dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">{PENDING_COST_HINT}</p>
    </div>
  );
}

/** The order's arithmetic, line by line: what came in, each thing that went out, what was left. */
export function OrderBreakdown({ row }: { row: OrderFinance }) {
  if (row.costPending) {
    return <PendingCostBreakdown row={row} />;
  }
  return (
    <dl className="grid gap-1.5 text-footnote">
      <div className="flex justify-between gap-4">
        <dt className="font-medium">Receita</dt>
        <dd className="font-medium tabular-nums">{formatCents(row.revenueCents)}</dd>
      </div>
      {breakdownEntries(row).map((entry) => (
        <div key={entry.label} className="flex justify-between gap-4 text-muted-foreground">
          <dt className="flex items-center gap-2">
            <span aria-hidden="true" className={cn("size-1.5 rounded-full", entry.color)} />
            {entry.label === "Taxas" ? (
              <HintedText label={TERM_HINTS.fees} className="hinted-term">
                {entry.label}
              </HintedText>
            ) : (
              entry.label
            )}
          </dt>
          <dd className="tabular-nums">{signedCents(entry.cents, { plus: true })}</dd>
        </div>
      ))}
      {row.returnCents > 0 ? (
        <div className="flex justify-between gap-4 text-muted-foreground">
          <dt>Devolvido</dt>
          <dd className="tabular-nums">{formatCents(row.returnCents)}</dd>
        </div>
      ) : null}
      <div className="mt-1 flex justify-between gap-4 border-t border-border pt-2">
        <dt className="font-medium">Lucro</dt>
        <dd className={cn("font-semibold tabular-nums", row.profitCents < 0 && "text-destructive")}>
          {signedCents(row.profitCents)}
        </dd>
      </div>
    </dl>
  );
}

/**
 * Profit as the headline amount: gains in the brand green, losses red, and a plain zero quiet.
 * A cancelled or returned order still shows a real loss (a refund it paid) in red.
 */
export function ProfitAmount({
  cents,
  plus = false,
  className,
}: {
  cents: number;
  plus?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-semibold whitespace-nowrap tabular-nums",
        cents > 0 && "text-brand-text",
        cents < 0 && "text-destructive",
        cents === 0 && "font-medium text-muted-foreground",
        className,
      )}
    >
      {signedCents(cents, { plus })}
    </span>
  );
}
