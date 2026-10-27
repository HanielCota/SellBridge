import type { SeriesPoint, SupportPerformanceReport } from "@sellbridge/shared/support-performance";
import { useCallback, useSyncExternalStore } from "react";
import { formatPercent } from "@/lib/percent";
import { changeCopy, previousBucketText } from "./performance-format";

/*
 * The kinds of the main support chart, copied from the sales dashboard's "Tipo de gráfico" and
 * adapted: the same five-slot menu, a default saved in this browser and a comparison layer.
 */

export const SUPPORT_CHART_KINDS = ["bars", "trend", "balance", "rate", "cumulative"] as const;
export type SupportChartKind = (typeof SUPPORT_CHART_KINDS)[number];

/** What every account sees until someone picks another default in this browser. */
export const FACTORY_SUPPORT_CHART: SupportChartKind = "bars";

export const SUPPORT_CHART_COPY: Record<
  SupportChartKind,
  { label: string; hint: string; title: string }
> = {
  bars: {
    label: "Barras",
    hint: "Entraram e resolvidos lado a lado",
    title: "Chamados que entraram e foram resolvidos",
  },
  trend: {
    label: "Evolução",
    hint: "As duas linhas ao longo do período",
    title: "Entraram e resolvidos ao longo do período",
  },
  balance: {
    label: "Saldo da fila",
    hint: "Entraram menos resolvidos: acima de zero a fila cresceu",
    title: "Quanto a fila cresceu em cada período",
  },
  rate: {
    label: "Taxa de resolução",
    hint: "Resolvidos ÷ entraram; acima de 100% a fila diminuiu",
    title: "Resolvidos para cada chamado que entrou",
  },
  cumulative: {
    label: "Acumulado",
    hint: "O total somado desde o início do período",
    title: "Entraram e resolvidos acumulados",
  },
};

/** Kinds that can draw the previous period behind the current one. */
export const COMPARABLE_KINDS: ReadonlySet<SupportChartKind> = new Set(["trend", "cumulative"]);

/** Kinds whose two series can be switched with the Tudo / Resolvidos / Entraram pills. */
export const KINDS_WITH_SERIES: ReadonlySet<SupportChartKind> = new Set([
  "bars",
  "trend",
  "cumulative",
]);

const STORAGE_KEY = "sellbridge-support-chart";
const CHANGE_EVENT = "sellbridge-support-chart-change";

function isKind(value: unknown): value is SupportChartKind {
  return SUPPORT_CHART_KINDS.some((kind) => kind === value);
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readDefault(): SupportChartKind {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isKind(saved) ? saved : FACTORY_SUPPORT_CHART;
  } catch {
    // Storage may be unavailable (private mode); the screen opens with the factory chart.
    return FACTORY_SUPPORT_CHART;
  }
}

function writeDefault(kind: SupportChartKind): void {
  if (kind === FACTORY_SUPPORT_CHART) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, kind);
}

function saveDefault(kind: SupportChartKind): void {
  try {
    writeDefault(kind);
  } catch {
    // Storage may be unavailable (private mode); the choice still applies to this page.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** The chart the screen opens with: the factory one, or the one this browser saved. */
export function useDefaultSupportChart(): {
  defaultKind: SupportChartKind;
  setDefaultKind: (kind: SupportChartKind) => void;
} {
  const defaultKind = useSyncExternalStore(subscribe, readDefault, () => FACTORY_SUPPORT_CHART);
  const setDefaultKind = useCallback((kind: SupportChartKind) => saveDefault(kind), []);
  return { defaultKind, setDefaultKind };
}

export interface KindPoint {
  start: string;
  opened: number;
  resolved: number;
  previousResolved: number;
  /** Opened minus resolved: above zero the queue grew. */
  balance: number;
  /** Resolved ÷ opened; null when nothing came in. */
  rate: number | null;
}

/** The series as each kind draws it; the cumulative kind sums from the period's first bucket. */
export function kindPoints(series: readonly SeriesPoint[], kind: SupportChartKind): KindPoint[] {
  let opened = 0;
  let resolved = 0;
  let previousResolved = 0;
  return series.map((point) => {
    opened = kind === "cumulative" ? opened + point.opened : point.opened;
    resolved = kind === "cumulative" ? resolved + point.resolved : point.resolved;
    previousResolved =
      kind === "cumulative" ? previousResolved + point.previousResolved : point.previousResolved;
    return {
      start: point.start,
      opened,
      resolved,
      previousResolved,
      balance: point.opened - point.resolved,
      rate: point.opened === 0 ? null : point.resolved / point.opened,
    };
  });
}

export interface KindHeadline {
  value: string;
  tone: "good" | "bad" | null;
  change: string | null;
  changeGood: boolean | null;
  note: string;
}

/** The big number above the chart, in the words of the chosen kind. */
export function kindHeadline(
  report: SupportPerformanceReport,
  kind: SupportChartKind,
): KindHeadline {
  const opened = report.overview.opened.current ?? 0;
  const resolved = report.overview.resolved.current ?? 0;
  const change = changeCopy({ ...report.overview.resolved, kind: "count" });
  const changeText =
    change === null
      ? null
      : change.direction === "flat"
        ? "igual"
        : `${change.direction === "up" ? "↑" : "↓"} ${change.label}`;
  if (kind === "balance") {
    const balance = opened - resolved;
    return {
      value: `${balance > 0 ? "+" : ""}${balance}`,
      tone: balance > 0 ? "bad" : "good",
      change: balance > 0 ? "a fila cresceu" : "a fila diminuiu ou ficou igual",
      changeGood: balance <= 0,
      note: `entraram ${opened} · resolvidos ${resolved}`,
    };
  }
  if (kind === "rate") {
    return {
      value: opened === 0 ? "—" : formatPercent(resolved / opened),
      tone: null,
      change: null,
      changeGood: null,
      note: "resolvidos ÷ entraram no período",
    };
  }
  return {
    value: String(resolved),
    tone: null,
    change: changeText,
    changeGood: change?.good ?? null,
    note:
      kind === "cumulative"
        ? "resolvidos até agora · vs. período anterior"
        : "resolvidos no período · vs. período anterior",
  };
}

/** The tooltip's last line: how the bucket's resolutions moved against the one before it. */
export function bucketComparison(
  points: readonly KindPoint[],
  index: number,
  bucket: SupportPerformanceReport["bucket"],
): string | null {
  const current = points[index];
  const before = points[index - 1];
  if (current === undefined || before === undefined || before.resolved === 0) {
    return null;
  }
  const change = Math.round(((current.resolved - before.resolved) / before.resolved) * 100);
  if (change === 0) {
    return `Resolvidos iguais ${previousBucketText(bucket).replace(/^a /, "aos da ").replace(/^o /, "aos do ")}`;
  }
  return `Resolvidos ${change > 0 ? "↑" : "↓"} ${Math.abs(change)}% vs. ${previousBucketText(bucket)}`;
}
