import type { SalesSummary } from "@sellbridge/database/repositories";
import { formatCents } from "@sellbridge/shared/money";
import { MoneyFigure, TrendBadge } from "@/components/reports/figures";
import { perHundred } from "@/features/reports/financial-rows";
import { cn } from "@/lib/utils";

const marginFormat = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const wholeReais = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

interface FlowPart {
  key: string;
  label: string;
  cents: number;
  /** Background utility shared by the bar segment and the legend dot. */
  color: string;
}

/** Where the money that came in went, in the order the bar draws it; empty parts are dropped. */
function flowParts(summary: SalesSummary): FlowPart[] {
  const parts: FlowPart[] = [
    { key: "cost", label: "Produtos", cents: summary.costCents, color: "bg-finance-cost" },
    {
      key: "fee",
      label: "Taxas",
      cents: summary.feeCents + summary.platformFeeCents,
      color: "bg-finance-fee",
    },
    {
      key: "refund",
      label: "Reembolsos",
      cents: summary.refundCents,
      color: "bg-finance-refund",
    },
    {
      key: "profit",
      label: "Seu lucro",
      cents: Math.max(summary.profitCents, 0),
      color: "bg-brand",
    },
  ];
  return parts.filter((part) => part.cents > 0);
}

function ordersLine(summary: SalesSummary): string {
  const parts = [`${summary.orders} ${summary.orders === 1 ? "pedido" : "pedidos"}`];
  if (summary.cancelledOrders > 0) {
    parts.push(
      `${summary.cancelledOrders} ${summary.cancelledOrders === 1 ? "cancelado" : "cancelados"}`,
    );
  }
  if (summary.returnCents > 0) {
    parts.push(`${formatCents(summary.returnCents)} devolvidos`);
  }
  return parts.join(" · ");
}

/** The answer first: what was left, out of how much was sold, and how it compares. */
function ProfitFigure({ summary, previous }: { summary: SalesSummary; previous: SalesSummary }) {
  const profit = summary.profitCents;
  const revenue = summary.revenueCents;
  const isLoss = profit < 0;
  return (
    <div className="flex min-w-0 flex-col gap-4 lg:pr-10">
      <div className="flex flex-wrap items-center gap-2">
        <p
          className={cn(
            "text-sm font-medium",
            isLoss ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {isLoss ? "Prejuízo" : "Lucro líquido"}
          <span className="sr-only">: {formatCents(profit)}</span>
        </p>
        {revenue > 0 ? (
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums",
              isLoss ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground",
            )}
          >
            {marginFormat.format(profit / revenue)} de margem
          </span>
        ) : null}
      </div>
      <div className="space-y-2">
        <MoneyFigure
          cents={profit}
          withCents
          className={cn("text-[44px] leading-none sm:text-[56px]", isLoss && "text-destructive")}
        />
        <p className="text-sm text-muted-foreground">
          de{" "}
          <span className="font-medium text-foreground tabular-nums">{formatCents(revenue)}</span>{" "}
          em vendas
        </p>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-xs text-muted-foreground">
        <TrendBadge
          current={summary.profitCents}
          previous={previous.profitCents}
          suffix="vs. período anterior"
        />
        <span title="Cancelados e devolvidos não entram na receita nem no lucro">
          {ordersLine(summary)}
        </span>
      </div>
    </div>
  );
}

/** One bar split into the parts, each a pill with a floor width so a sliver stays visible. */
function FlowBar({ parts }: { parts: readonly FlowPart[] }) {
  const total = parts.reduce((sum, part) => sum + part.cents, 0);
  return (
    <div aria-hidden="true" className="flex h-3 gap-1">
      {parts.map((part) => (
        <span
          key={part.key}
          className={cn("h-full min-w-2 rounded-full", part.color)}
          style={{ width: `${(part.cents / total) * 100}%` }}
        />
      ))}
    </div>
  );
}

/**
 * Every hundred reais that came in, split into where it went. Whole reais per hundred read
 * faster than percentages, and the exact amount sits right under each one.
 */
function MoneyFlow({ summary }: { summary: SalesSummary }) {
  const parts = flowParts(summary);
  if (parts.length === 0) {
    return (
      <p className="self-center text-sm text-muted-foreground">
        Quando houver vendas no período, você vê aqui para onde vai cada real que entra.
      </p>
    );
  }
  const isLoss = summary.profitCents < 0;
  const shares = perHundred(parts.map((part) => part.cents));
  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center gap-5">
      <h2 className="text-sm font-medium">
        {isLoss ? "Para onde foi cada R$ 100 gasto" : "Para onde vai cada R$ 100 que entra"}
      </h2>
      <FlowBar parts={parts} />
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-x-4 gap-y-5">
        {parts.map((part, index) => (
          <div key={part.key} className="min-w-0 space-y-1">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", part.color)} />
              <span className="truncate">{part.label}</span>
            </dt>
            <dd
              className={cn(
                "text-xl font-semibold tracking-tight tabular-nums",
                part.key === "profit" && "text-brand-text",
              )}
            >
              {shares[index] === 0 ? "< R$ 1" : wholeReais.format(shares[index] ?? 0)}
            </dd>
            <dd className="text-xs text-muted-foreground tabular-nums">
              {formatCents(part.cents)}
            </dd>
          </div>
        ))}
      </dl>
      <FlowNote summary={summary} />
    </div>
  );
}

/** The one thing the bar can't show: income on top of sales, or how far costs passed them. */
function FlowNote({ summary }: { summary: SalesSummary }) {
  if (summary.profitCents < 0) {
    return (
      <p className="text-xs text-destructive">
        Os custos passaram as vendas em {formatCents(-summary.profitCents)}.
      </p>
    );
  }
  if (summary.commissionCents > 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Inclui {formatCents(summary.commissionCents)} em comissões recebidas.
      </p>
    );
  }
  return null;
}

/** The period in one card: the profit on the left, the arithmetic behind it on the right. */
export function ProfitSummary({
  summary,
  previous,
}: {
  summary: SalesSummary;
  previous: SalesSummary;
}) {
  return (
    <section
      aria-label="Resumo do período"
      className="surface-card grid gap-8 rounded-3xl bg-card p-6 sm:p-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-0"
    >
      <ProfitFigure summary={summary} previous={previous} />
      <div className="flex border-t border-border pt-8 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
        <MoneyFlow summary={summary} />
      </div>
    </section>
  );
}
