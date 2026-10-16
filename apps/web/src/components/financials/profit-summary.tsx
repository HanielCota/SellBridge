import type { SalesSummary } from "@sellbridge/database/repositories";
import { formatCents } from "@sellbridge/shared/money";
import { InfoIcon, XIcon } from "@phosphor-icons/react";
import type { ComponentProps, ReactNode } from "react";
import { CashFlowChart } from "@/components/reports/cash-flow-chart";
import { PENDING_COST_HINT } from "@/components/reports/pending-cost";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDayHeading } from "@/features/reports/financial-rows";
import { cn } from "@/lib/utils";

const FEES_HINT = "Comissão do marketplace pela venda e a tarifa da SellBridge, somadas.";

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
  if (summary.pendingCostOrders > 0) {
    parts.push(`${summary.pendingCostOrders} com custo pendente`);
  }
  return parts.join(" · ");
}

/** An amount in the sentence, underlined in its part's color so it maps to the money it names. */
function Amount({
  cents,
  color,
  strong = false,
}: {
  cents: number;
  color: string;
  strong?: boolean;
}) {
  return (
    <span
      className={cn(
        "border-b-2 pb-px font-semibold whitespace-nowrap tabular-nums",
        color,
        strong && "text-brand-text",
      )}
    >
      {formatCents(cents)}
    </span>
  );
}

/** A small "i" beside a word; the explanation opens on hover or focus, never in the way. */
function Hint({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          // Drawn at the icon's size so it hugs the word; the invisible ::after keeps a fair touch target.
          className="relative ml-1 inline-flex size-3 items-center justify-center rounded-full align-[-1px] text-muted-foreground/70 outline-none after:absolute after:-inset-2 hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <InfoIcon aria-hidden="true" className="size-3" weight="bold" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Sales of unknown cost, set apart before the costs: "R$ 120,00 de 1 venda ainda não tem custo e
 * ficou fora do lucro." Underlined dashed, in the gray of the chart's hatched layer.
 */
function PendingClause({ summary }: { summary: SalesSummary }) {
  const one = summary.pendingCostOrders === 1;
  return (
    <>
      <Amount
        cents={summary.pendingCostRevenueCents}
        color="border-dashed border-muted-foreground/60 text-foreground"
      />{" "}
      de {summary.pendingCostOrders} {one ? "venda" : "vendas"} ainda{" "}
      {one ? "não tem custo e ficou" : "não têm custo e ficaram"} fora do lucro
      <Hint label={one ? "Por que ficou fora do lucro" : "Por que ficaram fora do lucro"}>
        {PENDING_COST_HINT}
      </Hint>
      .{" "}
    </>
  );
}

/** Every sale has an unknown cost and nothing else moved: there is no "rest" to break down. */
function isOnlyPendingCost(summary: SalesSummary): boolean {
  return (
    summary.pendingCostRevenueCents === summary.revenueCents &&
    summary.refundCents === 0 &&
    summary.commissionCents === 0
  );
}

/**
 * Where the money went, said as a sentence instead of a second chart: each amount underlined
 * in the color of its part, adding up to what was left.
 */
function MoneySentence({ summary, scope }: { summary: SalesSummary; scope: string }) {
  const revenue = summary.revenueCents;
  const fees = summary.feeCents + summary.platformFeeCents;
  const profit = summary.profitCents;
  if (revenue === 0 && summary.refundCents === 0 && summary.commissionCents === 0) {
    return <p className="mt-3 text-sm text-muted-foreground">Nenhuma venda {scope}.</p>;
  }
  if (isOnlyPendingCost(summary)) {
    return (
      <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-[15px]">
        Você vendeu <Amount cents={revenue} color="border-foreground/40 text-foreground" />.{" "}
        <PendingClause summary={summary} />
      </p>
    );
  }
  return (
    <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-[15px]">
      Você vendeu <Amount cents={revenue} color="border-foreground/40 text-foreground" />.{" "}
      {summary.pendingCostOrders > 0 ? (
        <>
          <PendingClause summary={summary} />
          Do restante,{" "}
        </>
      ) : (
        "Desse valor, "
      )}
      <Amount cents={summary.costCents} color="border-finance-cost text-foreground" /> pagaram os
      produtos e <Amount cents={fees} color="border-finance-fee text-foreground" /> foram taxas
      <Hint label="O que entra em taxas">{FEES_HINT}</Hint>
      {summary.refundCents > 0 ? (
        <>
          , e <Amount cents={summary.refundCents} color="border-finance-refund text-foreground" />{" "}
          voltaram em reembolsos
        </>
      ) : null}
      .{" "}
      {profit < 0 ? (
        <span className="text-destructive">
          Os custos passaram as vendas em{" "}
          <span className="font-semibold tabular-nums">{formatCents(-profit)}</span>.
        </span>
      ) : (
        <>
          {summary.commissionCents > 0 ? (
            <>
              Com <Amount cents={summary.commissionCents} color="border-brand text-foreground" /> de
              comissões, sobraram{" "}
            </>
          ) : (
            "Sobraram "
          )}
          <Amount cents={profit} color="border-brand" strong /> para você.
        </>
      )}
    </p>
  );
}

/** Which orders the sentence covers, and the way back to the whole period while a day is picked. */
function FooterLine({
  summary,
  pickedDay,
  canPick,
  onClear,
}: {
  summary: SalesSummary;
  pickedDay: string | null;
  canPick: boolean;
  onClear: () => void;
}) {
  return (
    <div className="flex min-h-7 flex-wrap items-center justify-between gap-x-3 gap-y-2 text-xs text-muted-foreground">
      {/* "Hoje" depends on the clock, so server and browser may disagree right at midnight. */}
      <p suppressHydrationWarning>
        {pickedDay ? (
          <span className="font-medium text-foreground">{formatDayHeading(pickedDay)} · </span>
        ) : null}
        {ordersLine(summary)}
        <Hint label="O que fica fora da receita">
          Aguardando pagamento, cancelados e devolvidos não entram na receita nem no lucro
        </Hint>
      </p>
      {pickedDay ? (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted py-1 pr-2 pl-3 text-xs font-medium text-foreground outline-none hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.97]"
        >
          Ver o período todo
          <XIcon aria-hidden="true" className="size-3" weight="bold" />
        </button>
      ) : null}
      {!pickedDay && canPick ? (
        <span className="max-sm:hidden">Clique num dia do gráfico para ver só ele</span>
      ) : null}
    </div>
  );
}

type ChartProps = ComponentProps<typeof CashFlowChart>;

/**
 * The period in one card, the same chart as the dashboard's: the profit and its trend, the
 * chart with every kind and layer, and under it the arithmetic said in one sentence. Clicking
 * a day narrows the sentence and the statement below to that day.
 */
export function ProfitSummary({
  summary,
  pickedDay,
  onPickDay,
  chart,
}: {
  /** The whole period, or the picked day. */
  summary: SalesSummary;
  /** The day the summary is narrowed to, or null for the whole period. */
  pickedDay: string | null;
  onPickDay: (day: string | null) => void;
  chart: Omit<ChartProps, "pickedDate" | "onPickDate" | "footer">;
}) {
  return (
    <CashFlowChart
      {...chart}
      pickedDate={pickedDay}
      onPickDate={onPickDay}
      footer={
        <div className="mt-6 border-t border-border pt-5">
          <FooterLine
            summary={summary}
            pickedDay={pickedDay}
            canPick={chart.bucket === "day"}
            onClear={() => onPickDay(null)}
          />
          <MoneySentence summary={summary} scope={pickedDay ? "neste dia" : "no período"} />
        </div>
      }
    />
  );
}
