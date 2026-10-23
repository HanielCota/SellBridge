import type { OrderFinancialRow, SupplierCredit } from "@sellbridge/database/repositories";
import { formatCents } from "@sellbridge/shared/money";
import { supplierCreditSummaryText, supplierCreditText } from "@sellbridge/shared/return-claims";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { TERM_HINTS } from "@/components/icons/action-icons";
import { ClaimStatusLine } from "@/components/support/return-claim-parts";
import { HintedText } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import { isVoidOrder } from "./order-parts";

const NO_CREDITS: readonly SupplierCredit[] = [];

const SupplierCreditsContext = createContext<ReadonlyMap<string, readonly SupplierCredit[]>>(
  new Map(),
);

/**
 * The supplier credits of the returned orders on the page, read by each statement row and its
 * detail without passing them through every level of the statement.
 */
export function SupplierCreditsProvider({
  credits,
  children,
}: {
  credits: readonly SupplierCredit[];
  children: ReactNode;
}) {
  const byOrder = useMemo(() => {
    const grouped = new Map<string, SupplierCredit[]>();
    for (const credit of credits) {
      grouped.set(credit.orderId, [...(grouped.get(credit.orderId) ?? []), credit]);
    }
    return grouped;
  }, [credits]);
  return <SupplierCreditsContext value={byOrder}>{children}</SupplierCreditsContext>;
}

export function useSupplierCredits(orderId: string): readonly SupplierCredit[] {
  return useContext(SupplierCreditsContext).get(orderId) ?? NO_CREDITS;
}

/** Each supplier's credit for a returned order, one line each (usually a single supplier). */
export function SupplierCreditLines({
  credits,
  className,
}: {
  credits: readonly SupplierCredit[];
  className?: string;
}) {
  if (credits.length === 0) {
    return null;
  }
  return (
    <div className={cn("space-y-1.5 border-t border-border pt-3", className)}>
      {credits.map((credit, index) => (
        <ClaimStatusLine key={`${credit.orderId}-${index}`} status={credit.status}>
          {supplierCreditText(credit)}
        </ClaimStatusLine>
      ))}
    </div>
  );
}

/** Where the supplier credit stands for every order a line stands for, or null when it varies. */
function useCreditSummary(rows: readonly OrderFinancialRow[]): string | null {
  const creditsByOrder = useContext(SupplierCreditsContext);
  if (rows.some((row) => row.status !== "returned")) {
    return null;
  }
  return supplierCreditSummaryText(rows.map((row) => creditsByOrder.get(row.id) ?? NO_CREDITS));
}

/**
 * What a line says under its amount: the sale it came from, or why it is out of the math. A line
 * can stand for several identical orders (`rows`), so a returned line speaks for all of them.
 */
export function AmountNote({
  rows,
  revenueCents,
}: {
  rows: readonly OrderFinancialRow[];
  revenueCents: number;
}) {
  const creditSummary = useCreditSummary(rows);
  const [row] = rows;
  if (row === undefined) {
    return null;
  }
  if (creditSummary !== null) {
    return <span>{creditSummary}</span>;
  }
  if (isVoidOrder(row)) {
    return (
      <HintedText label={TERM_HINTS.notASale} focusable={false} className="hinted-term">
        não conta como venda
      </HintedText>
    );
  }
  return (
    <>
      de {formatCents(revenueCents)}
      {/* On a phone the status above already says it; the line stays as short as its siblings'. */}
      {row.costPending ? <span className="max-sm:hidden"> · fora do lucro</span> : null}
    </>
  );
}
