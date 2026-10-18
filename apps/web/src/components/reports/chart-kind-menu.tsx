import { GearSixIcon } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { CHART_KINDS, FACTORY_CHART_KIND, type ChartKind } from "@/features/reports/chart-view";
import { cn } from "@/lib/utils";

const BRAND = "var(--chart-brand)";

const MINI_BARS = [
  { left: 4, total: 12, profit: 4 },
  { left: 13, total: 18, profit: 7 },
  { left: 22, total: 14, profit: 5 },
  { left: 31, total: 20, profit: 8 },
];

/** Tiny drawings of each chart, so the choice reads at a glance instead of by name. */
const THUMBNAILS: Record<ChartKind, ReactNode> = {
  area: (
    <>
      <path d="M2 22 C10 20 14 12 22 14 S34 6 42 4 V26 H2 Z" fill={BRAND} fillOpacity={0.25} />
      <path
        d="M2 22 C10 20 14 12 22 14 S34 6 42 4"
        fill="none"
        stroke={BRAND}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </>
  ),
  bars: (
    <>
      {MINI_BARS.map((bar) => (
        <g key={bar.left}>
          <rect
            x={bar.left}
            y={26 - bar.total}
            width={7}
            height={bar.total - bar.profit}
            rx={1}
            fill="currentColor"
            opacity={0.35}
          />
          <rect
            x={bar.left}
            y={26 - bar.profit}
            width={7}
            height={bar.profit}
            rx={1}
            fill={BRAND}
          />
        </g>
      ))}
    </>
  ),
  waterfall: (
    <>
      <rect x={3} y={4} width={7} height={22} rx={1} fill="currentColor" opacity={0.45} />
      <rect x={13} y={4} width={7} height={8} rx={1} fill="var(--finance-cost)" />
      <rect x={23} y={12} width={7} height={5} rx={1} fill="var(--finance-fee)" />
      <rect x={33} y={17} width={7} height={9} rx={1} fill={BRAND} />
    </>
  ),
  margin: (
    <>
      <path d="M2 13 H42" stroke="currentColor" strokeOpacity={0.4} strokeDasharray="2 3" />
      <path
        d="M2 18 L10 10 L18 15 L26 7 L34 12 L42 9"
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
      <path d="M2 25 C14 24 22 18 30 12 S38 4 42 3 V26 H2 Z" fill={BRAND} fillOpacity={0.25} />
      <path
        d="M2 25 C14 24 22 18 30 12 S38 4 42 3"
        fill="none"
        stroke={BRAND}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </>
  ),
};

const KIND_COPY: Record<ChartKind, { label: string; hint: string }> = {
  area: { label: "Evolução", hint: "Receita e lucro ao longo do tempo" },
  bars: { label: "Composição", hint: "Quanto de cada venda virou lucro" },
  waterfall: { label: "Cascata", hint: "Da receita ao lucro, passo a passo" },
  margin: { label: "Margem", hint: "Lucro como % da receita, por semana" },
  cumulative: { label: "Acumulado", hint: "Total somado desde o início" },
};

/** One cell of the two-column grid: the drawing and the name; the hint sits under the grid. */
function KindOption({
  kind,
  checked,
  isDefault,
  onSelect,
}: {
  kind: ChartKind;
  checked: boolean;
  isDefault: boolean;
  onSelect: (kind: ChartKind) => void;
}) {
  const copy = KIND_COPY[kind];
  return (
    <label
      title={copy.hint}
      aria-label={`${copy.label}${isDefault ? " (padrão)" : ""}: ${copy.hint}`}
      className={cn(
        "flex min-w-0 cursor-pointer items-center gap-2.5 rounded-xl border border-transparent p-1.5 transition-colors hover:bg-muted/60 active:scale-[0.98] has-focus-visible:ring-3 has-focus-visible:ring-ring/40",
        checked && "border-foreground/30 bg-muted/60",
      )}
    >
      <input
        type="radio"
        name="chart-kind"
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
  kind: ChartKind;
  defaultKind: ChartKind;
  onSetDefault: (kind: ChartKind) => void;
}) {
  if (kind !== defaultKind) {
    return (
      <button
        type="button"
        onClick={() => onSetDefault(kind)}
        className="flex h-9 w-full items-center justify-center rounded-full bg-foreground text-sm font-medium text-background outline-none transition-transform active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Usar {KIND_COPY[kind].label.toLowerCase()} como padrão
      </button>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
      <output>O painel abre com este gráfico.</output>
      {defaultKind === FACTORY_CHART_KIND ? null : (
        <button
          type="button"
          onClick={() => onSetDefault(FACTORY_CHART_KIND)}
          className="shrink-0 rounded-sm font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Restaurar original
        </button>
      )}
    </div>
  );
}

/** Extra lines drawn over the areas charts. */
export interface ChartLayers {
  /** The previous period, dashed behind the current one. */
  compare: boolean;
  /** The 7-day moving average, with the daily values stepping back. */
  average: boolean;
}

/** Which layers each chart can draw: only the areas charts have a timeline to lay them over. */
const LAYERS_BY_KIND: Record<ChartKind, readonly (keyof ChartLayers)[]> = {
  area: ["compare", "average"],
  bars: [],
  waterfall: [],
  margin: [],
  cumulative: ["compare"],
};

const LAYER_COPY: Record<keyof ChartLayers, string> = {
  compare: "Comparar com o período anterior",
  average: "Suavizar com média de 7 dias",
};

function LayerSwitches({
  available,
  layers,
  onChange,
}: {
  available: readonly (keyof ChartLayers)[];
  layers: ChartLayers;
  onChange: (layers: ChartLayers) => void;
}) {
  if (available.length === 0) {
    return null;
  }
  return (
    <fieldset className="mt-2 min-w-0 border-t border-border px-2 pt-2">
      <legend className="sr-only">Camadas do gráfico</legend>
      {available.map((layer) => (
        <label
          key={layer}
          className="flex h-8 min-w-0 cursor-pointer items-center justify-between gap-3 text-sm"
        >
          {LAYER_COPY[layer]}
          <Switch
            checked={layers[layer]}
            onCheckedChange={(checked) => onChange({ ...layers, [layer]: checked })}
          />
        </label>
      ))}
    </fieldset>
  );
}

interface ChartKindMenuProps {
  kind: ChartKind;
  defaultKind: ChartKind;
  onKindChange: (kind: ChartKind) => void;
  onSetDefault: (kind: ChartKind) => void;
  layers: ChartLayers;
  onLayersChange: (layers: ChartLayers) => void;
  /** The average only means something over daily points. */
  canAverage: boolean;
  canCompare: boolean;
  /** The card the menu must stay inside; it shifts, flips or scrolls rather than leave it. */
  boundary: HTMLElement | null;
}

/**
 * Closes the menu once its trigger stops being visible: the card has one gear per layout (phone
 * and wide), and a menu whose gear was hidden by a resize would lose its anchor and jump to the
 * corner of the page.
 */
function useMenuThatClosesWhenHidden() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = trigger.current;
    if (!open || !element) {
      return () => {};
    }
    const closeIfHidden = () => {
      if (element.offsetParent === null) {
        setOpen(false);
      }
    };
    const observer = new ResizeObserver(closeIfHidden);
    observer.observe(element);
    window.addEventListener("resize", closeIfHidden);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", closeIfHidden);
    };
  }, [open]);
  return { open, setOpen, trigger };
}

/** Gear next to the export: picks how the chart draws the period, and which one opens by default. */
export function ChartKindMenu({
  kind,
  defaultKind,
  onKindChange,
  onSetDefault,
  layers,
  onLayersChange,
  canAverage,
  canCompare,
  boundary,
}: ChartKindMenuProps) {
  const available = LAYERS_BY_KIND[kind].filter((layer) =>
    layer === "average" ? canAverage : canCompare,
  );
  const { open, setOpen, trigger } = useMenuThatClosesWhenHidden();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        ref={trigger}
        aria-label="Tipo de gráfico"
        title="Tipo de gráfico"
        className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=open]:border-foreground data-[state=open]:text-foreground"
      >
        <GearSixIcon className="size-4" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionBoundary={boundary}
        collisionPadding={8}
        className="max-h-(--radix-popover-content-available-height) w-88 max-w-(--radix-popover-content-available-width) overflow-y-auto overscroll-contain p-2"
      >
        <fieldset className="min-w-0">
          {/* The trigger already says "Tipo de gráfico"; the thumbnails need no visible title. */}
          <legend className="sr-only">Tipo de gráfico</legend>
          <div className="grid grid-cols-2 gap-1">
            {CHART_KINDS.map((option) => (
              <KindOption
                key={option}
                kind={option}
                checked={option === kind}
                isDefault={option === defaultKind}
                onSelect={onKindChange}
              />
            ))}
          </div>
          <p aria-hidden="true" className="truncate px-1.5 pt-2 text-xs text-muted-foreground">
            {KIND_COPY[kind].hint}
          </p>
        </fieldset>
        <LayerSwitches available={available} layers={layers} onChange={onLayersChange} />
        <div className="mt-2 border-t border-border px-1 pt-2 pb-1">
          <DefaultFooter kind={kind} defaultKind={defaultKind} onSetDefault={onSetDefault} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
