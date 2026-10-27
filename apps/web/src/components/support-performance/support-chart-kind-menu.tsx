import type { ReactNode } from "react";
import { ACTION_ICONS } from "@/components/icons/action-icons";
import { Hint } from "@/components/ui/hint";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  COMPARABLE_KINDS,
  FACTORY_SUPPORT_CHART,
  SUPPORT_CHART_COPY,
  SUPPORT_CHART_KINDS,
  type SupportChartKind,
} from "@/features/support/support-chart-kinds";
import { cn } from "@/lib/utils";

/*
 * The support chart's "Tipo de gráfico", the sales dashboard's menu adapted: a thumbnail per
 * kind, the comparison layer where it means something, and a default saved in this browser.
 */

const BRAND = "var(--chart-brand)";

const THUMBNAILS: Record<SupportChartKind, ReactNode> = {
  bars: (
    <>
      <rect x={5} y={10} width={5} height={16} rx={1} fill="currentColor" opacity={0.45} />
      <rect x={11} y={13} width={5} height={13} rx={1} fill={BRAND} />
      <rect x={24} y={6} width={5} height={20} rx={1} fill="currentColor" opacity={0.45} />
      <rect x={30} y={8} width={5} height={18} rx={1} fill={BRAND} />
    </>
  ),
  trend: (
    <>
      <path d="M2 22 C10 20 14 12 22 14 S34 6 42 6 V26 H2 Z" fill={BRAND} fillOpacity={0.25} />
      <path
        d="M2 22 C10 20 14 12 22 14 S34 6 42 6"
        fill="none"
        stroke={BRAND}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <path
        d="M2 18 C12 16 16 9 24 10 S36 4 42 3"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </>
  ),
  balance: (
    <>
      <path d="M2 14 H42" stroke="currentColor" strokeOpacity={0.4} />
      <rect x={5} y={6} width={6} height={8} rx={1} fill="var(--destructive)" />
      <rect x={15} y={14} width={6} height={5} rx={1} fill={BRAND} />
      <rect x={25} y={9} width={6} height={5} rx={1} fill="var(--destructive)" />
      <rect x={35} y={14} width={6} height={9} rx={1} fill={BRAND} />
    </>
  ),
  rate: (
    <>
      <path d="M2 9 H42" stroke="currentColor" strokeOpacity={0.5} strokeDasharray="2 3" />
      <path
        d="M2 16 L10 11 L18 14 L26 8 L34 12 L42 10"
        fill="none"
        stroke={BRAND}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  cumulative: (
    <>
      <path d="M2 25 C14 24 22 18 30 12 S38 5 42 4 V26 H2 Z" fill={BRAND} fillOpacity={0.25} />
      <path
        d="M2 25 C14 24 22 18 30 12 S38 5 42 4"
        fill="none"
        stroke={BRAND}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </>
  ),
};

function KindOption({
  kind,
  checked,
  isDefault,
  onSelect,
}: {
  kind: SupportChartKind;
  checked: boolean;
  isDefault: boolean;
  onSelect: (kind: SupportChartKind) => void;
}) {
  const copy = SUPPORT_CHART_COPY[kind];
  return (
    <label
      title={copy.hint}
      aria-label={`${copy.label}${isDefault ? " (padrão)" : ""}: ${copy.hint}`}
      className={cn(
        "flex min-w-0 cursor-pointer items-center gap-2.5 rounded-xl border border-transparent p-1.5 transition-colors hover:bg-muted/60 has-focus-visible:ring-3 has-focus-visible:ring-ring/40",
        checked && "border-foreground/30 bg-muted/60",
      )}
    >
      <input
        type="radio"
        name="support-chart-kind"
        value={kind}
        checked={checked}
        onChange={() => onSelect(kind)}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className="flex h-8 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground"
      >
        <svg viewBox="0 0 44 28" className="h-6 w-9">
          {THUMBNAILS[kind]}
        </svg>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{copy.label}</span>
        <span className="block h-4 text-caption leading-4 text-muted-foreground">
          {isDefault ? "Padrão" : null}
        </span>
      </span>
    </label>
  );
}

function DefaultFooter({
  kind,
  defaultKind,
  onSetDefault,
}: {
  kind: SupportChartKind;
  defaultKind: SupportChartKind;
  onSetDefault: (kind: SupportChartKind) => void;
}) {
  if (kind !== defaultKind) {
    return (
      <button
        type="button"
        onClick={() => onSetDefault(kind)}
        className="flex h-9 w-full items-center justify-center rounded-full bg-foreground text-sm font-medium text-background outline-none transition-transform active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Usar {SUPPORT_CHART_COPY[kind].label.toLowerCase()} como padrão
      </button>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
      <output>O painel abre com este gráfico.</output>
      {defaultKind === FACTORY_SUPPORT_CHART ? null : (
        <button
          type="button"
          onClick={() => onSetDefault(FACTORY_SUPPORT_CHART)}
          className="shrink-0 rounded-sm font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Restaurar original
        </button>
      )}
    </div>
  );
}

const ChartKindIcon = ACTION_ICONS.chartKind.icon;

export function SupportChartKindMenu({
  kind,
  defaultKind,
  compare,
  onKindChange,
  onSetDefault,
  onCompareChange,
}: {
  kind: SupportChartKind;
  defaultKind: SupportChartKind;
  compare: boolean;
  onKindChange: (kind: SupportChartKind) => void;
  onSetDefault: (kind: SupportChartKind) => void;
  onCompareChange: (compare: boolean) => void;
}) {
  return (
    <Popover>
      <Hint label={ACTION_ICONS.chartKind.hint} openOnTap={false}>
        <PopoverTrigger
          aria-label="Tipo de gráfico"
          className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=open]:border-foreground data-[state=open]:text-foreground"
        >
          <ChartKindIcon className="size-4" aria-hidden="true" />
        </PopoverTrigger>
      </Hint>
      <PopoverContent
        align="end"
        collisionPadding={8}
        className="max-h-(--radix-popover-content-available-height) w-88 max-w-(--radix-popover-content-available-width) overflow-y-auto overscroll-contain p-2"
      >
        <fieldset className="min-w-0">
          <legend className="sr-only">Tipo de gráfico</legend>
          <div className="grid grid-cols-2 gap-1">
            {SUPPORT_CHART_KINDS.map((option) => (
              <KindOption
                key={option}
                kind={option}
                checked={option === kind}
                isDefault={option === defaultKind}
                onSelect={onKindChange}
              />
            ))}
          </div>
          <p aria-hidden="true" className="px-1.5 pt-2 text-xs text-muted-foreground">
            {SUPPORT_CHART_COPY[kind].hint}
          </p>
        </fieldset>
        {COMPARABLE_KINDS.has(kind) ? (
          <CompareSwitch compare={compare} onCompareChange={onCompareChange} />
        ) : null}
        <div className="mt-2 border-t border-border px-1 pt-2 pb-1">
          <DefaultFooter kind={kind} defaultKind={defaultKind} onSetDefault={onSetDefault} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CompareSwitch({
  compare,
  onCompareChange,
}: {
  compare: boolean;
  onCompareChange: (compare: boolean) => void;
}) {
  return (
    <label
      htmlFor="support-chart-compare"
      className="mt-2 flex h-10 min-w-0 cursor-pointer items-center justify-between gap-3 border-t border-border px-2 pt-2 text-sm"
    >
      Comparar com o período anterior
      <Switch id="support-chart-compare" checked={compare} onCheckedChange={onCompareChange} />
    </label>
  );
}
