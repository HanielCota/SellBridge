import type { ReportChart } from "@/features/report-kit/report-model";
import { GroupedBarsChart, HistogramChart, SplitChart } from "./bar-charts";
import { HeatmapChart, RatingChart } from "./rating-heatmap-charts";
import { ReportCard } from "./report-card";
import { TrendChart } from "./trend-chart";

function chartTitle(chart: ReportChart): string {
  return chart.kind === "heatmap" ? chart.heatmap.title : chart.title;
}

function ChartBody({ chart, showValues }: { chart: ReportChart; showValues: boolean }) {
  if (chart.kind === "grouped_bars") {
    return <GroupedBarsChart items={chart.items} format={chart.format} showValues={showValues} />;
  }
  if (chart.kind === "trend") {
    return (
      <TrendChart
        points={chart.points}
        format={chart.format}
        target={chart.target}
        showValues={showValues}
      />
    );
  }
  if (chart.kind === "histogram") {
    return (
      <HistogramChart
        buckets={chart.buckets}
        median={chart.median}
        percentile90={chart.percentile90}
        showValues={showValues}
      />
    );
  }
  if (chart.kind === "split") {
    return <SplitChart rows={chart.rows} />;
  }
  if (chart.kind === "rating") {
    return <RatingChart average={chart.average} counts={chart.counts} />;
  }
  return <HeatmapChart heatmap={chart.heatmap} />;
}

/** The chart cards, as many per row as fit at 340px or more; one column on phones. */
export function ReportChartsGrid({
  charts,
  showValues,
}: {
  charts: readonly ReportChart[];
  showValues: boolean;
}) {
  if (charts.length === 0) {
    return null;
  }
  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))] print:grid-cols-2">
      {charts.map((chart) => (
        <ReportCard key={chartTitle(chart)} title={chartTitle(chart)} note={chart.note}>
          <ChartBody chart={chart} showValues={showValues} />
        </ReportCard>
      ))}
    </div>
  );
}
