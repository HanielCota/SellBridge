/*
 * The monthly report every profile downloads (reseller, supplier, admin), as plain data. Each
 * profile fills it from its own numbers; the page, the print and the snapshot of a closed month
 * all read this one shape, so the table and the charts come from the same calculation.
 */

/** How a number is written: counts, money in cents, a 0–1 rate, minutes, or a 1–5 rating. */
export type ReportValueFormat = "count" | "cents" | "rate" | "minutes" | "rating";

/** Whether going up is good news (sales), bad news (cancellations) or neither (volume). */
export type ReportSense = "higher_is_better" | "lower_is_better" | "neutral";

export interface ReportTarget {
  value: number;
  /** "at least" for rates to reach, "at most" for problems to keep low. */
  kind: "min" | "max";
}

export interface ReportMetricRow {
  kind: "metric";
  label: string;
  /** What a rate was computed over ("de 179 respondidos"): never a percentage on its own. */
  base: string | null;
  count: number | null;
  countFormat: ReportValueFormat;
  rate: number | null;
  rateFormat: ReportValueFormat;
  /** The value compared with the previous period and the target: the rate, else the count. */
  previous: number | null;
  target: ReportTarget | null;
  sense: ReportSense;
  /** Subcategories sit indented under their total. */
  indent: boolean;
}

export interface ReportGroupRow {
  kind: "group";
  label: string;
  /** "14 deles do período anterior": why two group totals do not add up. */
  note: string | null;
}

export type ReportIndicatorRow = ReportMetricRow | ReportGroupRow;

export interface ReportBarItem {
  label: string;
  current: number;
  previous: number;
}

export interface ReportTrendPoint {
  month: string;
  value: number | null;
}

export interface ReportSplitRow {
  label: string;
  yesLabel: string;
  yes: number;
  noLabel: string;
  no: number;
}

export interface ReportBucket {
  label: string;
  count: number;
}

export interface ReportAttentionItem {
  label: string;
  count: number;
  /** "de 120 pedidos": the base under each label. */
  base: string;
}

export interface ReportCase {
  id: string;
  title: string;
  detail: string;
  meta: string | null;
  href: string | null;
}

export interface ReportCaseTab {
  key: string;
  label: string;
  items: ReportCase[];
  /** How many more did not fit; they are in the spreadsheet. */
  more: number;
}

export interface ReportHeatmap {
  title: string;
  rowLabels: string[];
  columnLabels: string[];
  /** `cells[row][column]`. */
  cells: number[][];
  unit: string;
}

export type ReportChart =
  | {
      kind: "grouped_bars";
      title: string;
      note: string | null;
      format: ReportValueFormat;
      items: ReportBarItem[];
    }
  | {
      kind: "trend";
      title: string;
      note: string | null;
      format: ReportValueFormat;
      target: ReportTarget | null;
      points: ReportTrendPoint[];
    }
  | {
      kind: "histogram";
      title: string;
      note: string | null;
      buckets: ReportBucket[];
      median: string | null;
      percentile90: string | null;
    }
  | { kind: "split"; title: string; note: string | null; rows: ReportSplitRow[] }
  | {
      kind: "rating";
      title: string;
      note: string | null;
      average: number | null;
      /** Count of each rating, 5 stars first. */
      counts: { stars: number; count: number }[];
    }
  | { kind: "heatmap"; heatmap: ReportHeatmap; note: string | null };

export interface ReportTeamRow {
  id: string;
  name: string;
  days: number;
  total: number;
  topCategory: string | null;
  medianMinutes: number | null;
  onTimeRate: number | null;
  reworkRate: number | null;
  averageRating: number | null;
  ratings: number;
}

export interface ReportRule {
  title: string;
  text: string;
}

export interface MonthlyReport {
  /** Bumped when the shape changes, so an older snapshot is recomputed instead of misread. */
  version: number;
  /** "Relatório de vendas". */
  title: string;
  /** "pedido", "chamado" (singular): "Nenhum pedido em Outubro de 2026". */
  itemNoun: string;
  /** True when the period had nothing to report. */
  empty: boolean;
  indicators: ReportIndicatorRow[];
  charts: ReportChart[];
  attention: { title: string; items: ReportAttentionItem[] } | null;
  cases: ReportCaseTab[];
  team: ReportTeamRow[] | null;
  rules: ReportRule[];
}

export interface ServedReport {
  report: MonthlyReport;
  /** When a closed month's numbers were kept; null while they are still computed live. */
  savedAt: string | null;
  generatedAt: string;
}

export const MONTHLY_REPORT_VERSION = 1;
/** Below this many ratings a person's average says more about luck: "Poucas notas". */
export const MIN_RATINGS_FOR_AVERAGE = 10;
/** Cases listed on the page per tab; the rest are in the spreadsheet. */
export const CASES_PER_TAB = 8;
