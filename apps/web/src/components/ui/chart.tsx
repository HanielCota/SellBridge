import * as React from "react";
import { cn } from "@/lib/utils";
import * as RechartsPrimitive from "recharts";

/** Each theme and the selector its colors apply under. */
const THEMES = [
  { name: "light", selector: "" },
  { name: "dark", selector: ".dark" },
] as const;
type ThemeName = (typeof THEMES)[number]["name"];

const INITIAL_DIMENSION = { width: 320, height: 200 } as const;

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
    icon?: React.ComponentType;
  } & ({ color?: string; theme?: never } | { color?: never; theme: Record<ThemeName, string> })
>;

/** A series' color in one theme: its own per-theme color, or the one color it has for all. */
function seriesColor(series: ChartConfig[string], theme: ThemeName): string | undefined {
  return series.theme?.[theme] ?? series.color;
}

/** One `--color-<key>` custom property per colored series, for each theme. */
function themeRules(id: string, config: ChartConfig): string {
  const colored = Object.entries(config).filter(([, series]) => series.theme ?? series.color);
  if (colored.length === 0) {
    return "";
  }
  return THEMES.map(({ name, selector }) => {
    const declarations = colored
      .map(([key, series]) => {
        const color = seriesColor(series, name);
        return color === undefined ? null : `  --color-${key}: ${color};`;
      })
      .filter((declaration) => declaration !== null)
      .join("\n");
    return `${selector} [data-chart=${id}] {\n${declarations}\n}`;
  }).join("\n");
}

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const rules = themeRules(id, config);
  if (rules === "") {
    return null;
  }
  return <style dangerouslySetInnerHTML={{ __html: rules }} />;
}

function ChartContainer({
  id,
  className,
  children,
  config,
  initialDimension = INITIAL_DIMENSION,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"];
  initialDimension?: {
    width: number;
    height: number;
  };
}) {
  const uniqueId = React.useId();
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, "")}`;

  return (
    <div
      data-slot="chart"
      data-chart={chartId}
      className={cn(
        "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector]:outline-hidden [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-hidden [&_.recharts-surface:focus-visible]:rounded-md [&_.recharts-surface:focus-visible]:outline-2 [&_.recharts-surface:focus-visible]:outline-solid [&_.recharts-surface:focus-visible]:outline-offset-2 [&_.recharts-surface:focus-visible]:outline-ring/60",
        className,
      )}
      {...props}
    >
      <ChartStyle id={chartId} config={config} />
      <RechartsPrimitive.ResponsiveContainer initialDimension={initialDimension}>
        {children}
      </RechartsPrimitive.ResponsiveContainer>
    </div>
  );
}

const ChartTooltip = RechartsPrimitive.Tooltip;

export { ChartContainer, ChartTooltip };
