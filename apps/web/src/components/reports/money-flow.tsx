import { formatCents } from "@sellbridge/shared/money";
import { cn } from "cn";
import {
  buildMoneyFlow,
  type FlowPart,
  type MoneyFlow as MoneyFlowData,
  type SummaryFigures,
} from "@/features/reports/dashboard-insights";

type MoneyFlowParts = MoneyFlowData["parts"];

const PART_STYLES: Record<FlowPart, { label: string; swatch: string }> = {
  cost: { label: "Custo dos produtos", swatch: "bg-zinc-400 dark:bg-zinc-500" },
  fees: { label: "Taxas de marketplace e plataforma", swatch: "bg-zinc-300 dark:bg-zinc-600" },
  refunds: { label: "Reembolsos", swatch: "bg-red-300 dark:bg-red-400/70" },
  profit: { label: "Seu lucro", swatch: "bg-chart-brand" },
};

const perHundred = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

function FlowLegend({ parts }: { parts: MoneyFlowParts }) {
  return (
    <ul className="mt-5 space-y-3 text-sm">
      {parts.map((part) => (
        <li key={part.key} className="flex items-baseline gap-3">
          <span
            className={cn(
              "size-2.5 shrink-0 translate-y-px rounded-full",
              PART_STYLES[part.key].swatch,
            )}
            aria-hidden="true"
          />
          <span className={cn("flex-1", part.key === "profit" && "font-medium")}>
            {PART_STYLES[part.key].label}
          </span>
          <span
            className={cn(
              "tabular-nums",
              part.key === "profit" ? "font-semibold" : "text-muted-foreground",
            )}
          >
            {perHundred.format(part.perHundred)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Out of every R$ 100 sold, how much goes to each cost and how much stays as profit. */
export function MoneyFlow({ summary }: { summary: SummaryFigures }) {
  const flow = buildMoneyFlow(summary);
  return (
    <section
      aria-labelledby="money-flow-title"
      className="flex h-full flex-col rounded-2xl border bg-card p-5"
    >
      <h2 id="money-flow-title" className="text-[15px] font-semibold">
        Para onde vai cada R$ 100 vendidos
      </h2>
      {flow ? (
        <>
          <div className="mt-5 flex h-3 gap-0.5" aria-hidden="true">
            {flow.parts.map((part) => (
              <span
                key={part.key}
                className={cn(
                  "h-full first:rounded-l-full last:rounded-r-full",
                  PART_STYLES[part.key].swatch,
                )}
                style={{ width: `${part.share * 100}%` }}
              />
            ))}
          </div>
          <FlowLegend parts={flow.parts} />
          <p className="mt-auto pt-5 text-xs text-muted-foreground">
            Valores proporcionais ao total vendido no período ({formatCents(summary.revenueCents)}).
            {flow.commissionCents > 0
              ? ` O lucro já inclui ${formatCents(flow.commissionCents)} em comissões recebidas.`
              : null}
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Sem vendas com lucro neste período para detalhar.
        </p>
      )}
    </section>
  );
}
