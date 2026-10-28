import { Bar, BarChart } from "recharts";
import { CHART_MARGIN, formatMoney, renderFrame } from "@/components/reports/chart-frame";
import { TooltipCard, TooltipRow, type TooltipProps } from "@/components/reports/chart-tooltip";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { niceScale } from "@/features/reports/chart-view";
import { formatAxisDate, formatTooltipDate } from "@/features/reports/dashboard-metrics";
import type { SupplierSalesPageData } from "@/features/supplier-panel/sales-page/sales-page.queries";

const BAR_COLOR = "var(--chart-brand)";
const chartConfig = { orders: { label: "Pedidos", color: BAR_COLOR } } satisfies ChartConfig;
const count = new Intl.NumberFormat("pt-BR");

type Point = SupplierSalesPageData["series"][number];

/** The hover card: the day, its orders, pieces and what the supplier receives. */
function OrdersTooltip({
  active,
  payload,
  bucket,
}: TooltipProps<Point> & { bucket: SupplierSalesPageData["bucket"] }) {
  const point = payload?.[0]?.payload;
  if (active !== true || point === undefined) {
    return null;
  }
  return (
    <TooltipCard title={formatTooltipDate(point.date, bucket)}>
      <TooltipRow color={BAR_COLOR} label="Pedidos" value={count.format(point.orders)} strong />
      <TooltipRow color="var(--muted-foreground)" label="Peças" value={count.format(point.units)} />
      <TooltipRow
        color="var(--muted-foreground)"
        label="Você recebe"
        value={formatMoney(point.receivableCents)}
      />
    </TooltipCard>
  );
}

/** "Pedidos por dia": one bar a day (a week for long ranges), details on hover only. */
export function SalesOrdersChart({ data }: { data: SupplierSalesPageData }) {
  const scale = niceScale(data.series.map((point) => point.orders));
  const total = data.series.reduce((sum, point) => sum + point.orders, 0);
  const title = data.bucket === "week" ? "Pedidos por semana" : "Pedidos por dia";
  return (
    <section
      aria-labelledby="sales-orders-chart-title"
      className="surface-card flex flex-col rounded-3xl bg-card p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="sales-orders-chart-title" className="text-subhead font-medium">
          {title}
        </h2>
        <span className="text-footnote text-muted-foreground tabular-nums">
          {count.format(total)} {total === 1 ? "pedido" : "pedidos"} no período
        </span>
      </div>
      <figure
        className="relative mt-4 h-64"
        aria-label={`${title}: ${count.format(total)} no período`}
      >
        <ChartContainer config={chartConfig} className="absolute inset-0 aspect-auto size-full">
          <BarChart data={data.series} margin={CHART_MARGIN}>
            {renderFrame({
              scale,
              formatY: (value) => count.format(value),
              formatX: (value) => formatAxisDate(value, data.bucket),
            })}
            <ChartTooltip
              cursor={{ fill: "var(--foreground)", fillOpacity: 0.06 }}
              content={<OrdersTooltip bucket={data.bucket} />}
            />
            <Bar dataKey="orders" fill={BAR_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ChartContainer>
      </figure>
    </section>
  );
}
