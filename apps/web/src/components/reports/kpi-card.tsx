import { percentChange } from "@sellbridge/shared/money";
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  icon: LucideIcon;
  value: string;
  current: number;
  previous: number | null;
  hint?: string | undefined;
}

function TrendIcon({ change }: { change: number }) {
  if (change === 0) {
    return <Minus className="size-3.5" aria-hidden="true" />;
  }
  if (change > 0) {
    return <ArrowUpRight className="size-3.5" aria-hidden="true" />;
  }
  return <ArrowDownRight className="size-3.5" aria-hidden="true" />;
}

function DeltaBadge({ current, previous }: { current: number; previous: number | null }) {
  if (previous === null) {
    return null;
  }
  const change = percentChange(current, previous);
  if (change === null) {
    return <span className="text-xs text-muted-foreground">sem base de comparação</span>;
  }
  const isUp = change > 0;
  const isFlat = change === 0;
  const label = `${isUp ? "+" : ""}${change.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        isFlat && "text-muted-foreground",
        isUp && "text-emerald-600 dark:text-emerald-400",
        !isUp && !isFlat && "text-red-600 dark:text-red-400",
      )}
    >
      <TrendIcon change={change} />
      {label}
      <span className="sr-only"> em relação ao período anterior</span>
    </span>
  );
}

export function KpiCard({ label, icon: Icon, value, current, previous, hint }: KpiCardProps) {
  return (
    <Card className="gap-2">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        <div className="flex items-center gap-2">
          <DeltaBadge current={current} previous={previous} />
          {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}
