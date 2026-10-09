import { formatCents } from "@sellbridge/shared/money";
import { cn } from "cn";
import { ComparisonMeter, MoneyFigure } from "./figures";

interface HeroStats {
  profitCents: number;
  revenue: { current: number; previous: number };
  orders: { current: number; previous: number };
}

const compactMoney = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

/** Big two-line title; with data, the profit as the headline and two meters against last period. */
export function DashboardHero({ stats }: { stats: HeroStats | null }) {
  return (
    <section className="grid items-end gap-8 pt-4 pb-2 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] xl:gap-12">
      <h1 className="text-[44px] leading-[1.02] font-semibold tracking-[-0.035em] sm:text-[56px]">
        Painel de
        <br />
        vendas
      </h1>
      {stats ? <HeroStatsRow stats={stats} /> : null}
    </section>
  );
}

function HeroStatsRow({ stats }: { stats: HeroStats }) {
  const { profitCents, revenue, orders } = stats;
  return (
    <>
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          Lucro no período<span className="sr-only">: {formatCents(profitCents)}</span>
        </p>
        <div className="flex">
          <MoneyFigure
            cents={profitCents}
            className={cn("text-[52px] leading-none", profitCents < 0 && "text-destructive")}
          />
        </div>
      </div>
      <div className="grid gap-8 sm:grid-cols-2">
        <ComparisonMeter
          label="Receita"
          current={revenue.current}
          previous={revenue.previous}
          format={(cents) => compactMoney.format(cents / 100)}
        />
        <ComparisonMeter
          label="Pedidos"
          current={orders.current}
          previous={orders.previous}
          format={(count) => count.toLocaleString("pt-BR")}
        />
      </div>
    </>
  );
}
