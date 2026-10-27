import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { ACTION_ICONS } from "@/components/icons/action-icons";
import { Hint } from "@/components/ui/hint";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { CHART_KINDS, FACTORY_CHART_KIND, type ChartKind } from "@/features/reports/chart-view";

/** Every chart a dashboard menu can offer: the reseller's five, plus the supplier's per product. */
export type MenuChartKind = ChartKind | "products";
import { cn } from "@/lib/utils";

const BRAND = "var(--chart-brand)";

const MINI_BARS = [
  { left: 4, total: 12, profit: 4 },
  { left: 13, total: 18, profit: 7 },
  { left: 22, total: 14, profit: 5 },
  { left: 31, total: 20, profit: 8 },
];

/** Tiny drawings of each chart, so the choice reads at a glance instead of by name. */
const THUMBNAILS: Record<MenuChartKind, ReactNode> = {
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
  products: (
    <>
      <path
        d="M2 20 L12 12 L22 15 L32 7 L42 9"
        fill="none"
        stroke={BRAND}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 24 L12 21 L22 23 L32 17 L42 19"
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.5}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
};

const KIND_COPY: Record<MenuChartKind, { label: string; hint: string }> = {
  area: { label: "Evolução", hint: "Receita e lucro ao longo do tempo" },
  bars: { label: "Composição", hint: "Quanto de cada venda virou lucro" },
  waterfall: { label: "Cascata", hint: "Da receita ao lucro, passo a passo" },
  margin: { label: "Margem", hint: "Lucro como % da receita, por semana" },
  cumulative: { label: "Acumulado", hint: "Total somado desde o início" },
  products: { label: "Por produto", hint: "Os mais vendidos, cada um na sua linha" },
};

/** A dashboard's own words for what each chart shows, over the reseller's. */
export type KindHints = Partial<Record<MenuChartKind, string>>;

/** One cell of the two-column grid: the drawing and the name; the hint sits under the grid. */
function KindOption({
  kind,
  checked,
  isDefault,
  hint,
  onSelect,
}: {
  kind: MenuChartKind;
  checked: boolean;
  isDefault: boolean;
  hint: string;
  onSelect: (kind: MenuChartKind) => void;
}) {
  const copy = { label: KIND_COPY[kind].label, hint };
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
  factoryKind,
  onSetDefault,
}: {
  kind: MenuChartKind;
  defaultKind: MenuChartKind;
  factoryKind: MenuChartKind;
  onSetDefault: (kind: MenuChartKind) => void;
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
      {defaultKind === factoryKind ? null : (
        <button
          type="button"
          onClick={() => onSetDefault(factoryKind)}
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
const LAYERS_BY_KIND: Record<MenuChartKind, readonly (keyof ChartLayers)[]> = {
  area: ["compare", "average"],
  bars: [],
  waterfall: [],
  margin: [],
  cumulative: ["compare"],
  products: [],
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

interface ChartKindMenuProps<Kind extends MenuChartKind> {
  kind: Kind;
  defaultKind: Kind;
  onKindChange: (kind: Kind) => void;
  onSetDefault: (kind: Kind) => void;
  /** The charts offered, in order; the reseller dashboard's five when left out. */
  kinds?: readonly Kind[];
  /** The chart "Restaurar original" goes back to; the reseller's when left out. */
  factoryKind?: Kind;
  hints?: KindHints;
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
const ChartKindIcon = ACTION_ICONS.chartKind.icon;

/** The menu button: icon and hint everywhere, the word too where the toolbar has room. */
function ChartKindTrigger({ triggerRef }: { triggerRef: RefObject<HTMLButtonElement | null> }) {
  return (
    <Hint label={ACTION_ICONS.chartKind.hint} openOnTap={false}>
      <PopoverTrigger
        ref={triggerRef}
        aria-label="Tipo de gráfico"
        className="flex size-10 shrink-0 items-center justify-center gap-2 rounded-full border border-border text-sm min-[1440px]:w-auto min-[1440px]:pr-4 min-[1440px]:pl-3.5 font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=open]:border-foreground data-[state=open]:text-foreground"
      >
        <ChartKindIcon className="size-4" aria-hidden="true" />
        {/* Below 1440px the word pushed the store filter to a second row (1280) and cut the period
        track (768); the icon and its hint stand alone there. */}
        <span aria-hidden="true" className="hidden min-[1440px]:inline">
          Gráfico
        </span>
      </PopoverTrigger>
    </Hint>
  );
}

/**
 * The charts a dashboard offers, and its callbacks narrowed to them: the menu's options are
 * every kind, the dashboard only hears about its own.
 */
function useOfferedKinds<Kind extends MenuChartKind>({
  kinds,
  hints = {},
  onKindChange,
  onSetDefault,
}: {
  kinds: readonly Kind[] | undefined;
  hints: KindHints | undefined;
  onKindChange: (kind: Kind) => void;
  onSetDefault: (kind: Kind) => void;
}) {
  const offered: readonly MenuChartKind[] = kinds ?? CHART_KINDS;
  const isOffered = (value: MenuChartKind): value is Kind => offered.includes(value);
  return {
    offered,
    choose: (value: MenuChartKind) => {
      if (isOffered(value)) onKindChange(value);
    },
    saveDefault: (value: MenuChartKind) => {
      if (isOffered(value)) onSetDefault(value);
    },
    hintOf: (value: MenuChartKind) => hints[value] ?? KIND_COPY[value].hint,
  };
}

function KindGrid({
  offered,
  kind,
  defaultKind,
  hintOf,
  onSelect,
}: {
  offered: readonly MenuChartKind[];
  kind: MenuChartKind;
  defaultKind: MenuChartKind;
  hintOf: (kind: MenuChartKind) => string;
  onSelect: (kind: MenuChartKind) => void;
}) {
  return (
    <fieldset className="min-w-0">
      {/* The trigger already says "Tipo de gráfico"; the thumbnails need no visible title. */}
      <legend className="sr-only">Tipo de gráfico</legend>
      <div className="grid grid-cols-2 gap-1">
        {offered.map((option) => (
          <KindOption
            key={option}
            kind={option}
            checked={option === kind}
            isDefault={option === defaultKind}
            hint={hintOf(option)}
            onSelect={onSelect}
          />
        ))}
      </div>
      <p aria-hidden="true" className="truncate px-1.5 pt-2 text-xs text-muted-foreground">
        {hintOf(kind)}
      </p>
    </fieldset>
  );
}

export function ChartKindMenu<Kind extends MenuChartKind>({
  kind,
  defaultKind,
  onKindChange,
  onSetDefault,
  kinds,
  factoryKind,
  hints,
  layers,
  onLayersChange,
  canAverage,
  canCompare,
  boundary,
}: ChartKindMenuProps<Kind>) {
  const { offered, choose, saveDefault, hintOf } = useOfferedKinds({
    kinds,
    hints,
    onKindChange,
    onSetDefault,
  });
  const available = LAYERS_BY_KIND[kind].filter((layer) =>
    layer === "average" ? canAverage : canCompare,
  );
  const { open, setOpen, trigger } = useMenuThatClosesWhenHidden();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <ChartKindTrigger triggerRef={trigger} />
      <PopoverContent
        align="end"
        collisionBoundary={boundary}
        collisionPadding={8}
        className="max-h-(--radix-popover-content-available-height) w-88 max-w-(--radix-popover-content-available-width) overflow-y-auto overscroll-contain p-2"
      >
        <KindGrid {...{ offered, kind, defaultKind, hintOf }} onSelect={choose} />
        <LayerSwitches available={available} layers={layers} onChange={onLayersChange} />
        <div className="mt-2 border-t border-border px-1 pt-2 pb-1">
          <DefaultFooter
            kind={kind}
            defaultKind={defaultKind}
            factoryKind={factoryKind ?? FACTORY_CHART_KIND}
            onSetDefault={saveDefault}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
