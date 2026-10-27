import { z } from "zod";
import { MONTHLY_REPORT_VERSION, type MonthlyReport } from "./report-model";

/*
 * A stored snapshot comes back from the database as JSON: it is checked against the report's
 * shape before the page trusts it. A snapshot of an older version fails here and is recomputed.
 */

const valueFormat = z.enum(["count", "cents", "rate", "minutes", "rating"]);
const target = z.object({ value: z.number(), kind: z.enum(["min", "max"]) }).nullable();
const note = z.string().nullable();

const indicatorRow = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("metric"),
    label: z.string(),
    base: z.string().nullable(),
    count: z.number().nullable(),
    countFormat: valueFormat,
    rate: z.number().nullable(),
    rateFormat: valueFormat,
    previous: z.number().nullable(),
    target,
    sense: z.enum(["higher_is_better", "lower_is_better", "neutral"]),
    indent: z.boolean(),
  }),
  z.object({ kind: z.literal("group"), label: z.string(), note }),
]);

const chart = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("grouped_bars"),
    title: z.string(),
    note,
    format: valueFormat,
    items: z.array(z.object({ label: z.string(), current: z.number(), previous: z.number() })),
  }),
  z.object({
    kind: z.literal("trend"),
    title: z.string(),
    note,
    format: valueFormat,
    target,
    points: z.array(z.object({ month: z.string(), value: z.number().nullable() })),
  }),
  z.object({
    kind: z.literal("histogram"),
    title: z.string(),
    note,
    buckets: z.array(z.object({ label: z.string(), count: z.number() })),
    median: z.string().nullable(),
    percentile90: z.string().nullable(),
  }),
  z.object({
    kind: z.literal("split"),
    title: z.string(),
    note,
    rows: z.array(
      z.object({
        label: z.string(),
        yesLabel: z.string(),
        yes: z.number(),
        noLabel: z.string(),
        no: z.number(),
      }),
    ),
  }),
  z.object({
    kind: z.literal("rating"),
    title: z.string(),
    note,
    average: z.number().nullable(),
    counts: z.array(z.object({ stars: z.number(), count: z.number() })),
  }),
  z.object({
    kind: z.literal("heatmap"),
    note,
    heatmap: z.object({
      title: z.string(),
      rowLabels: z.array(z.string()),
      columnLabels: z.array(z.string()),
      cells: z.array(z.array(z.number())),
      unit: z.string(),
    }),
  }),
]);

const caseTab = z.object({
  key: z.string(),
  label: z.string(),
  items: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      detail: z.string(),
      meta: z.string().nullable(),
      href: z.string().nullable(),
    }),
  ),
  more: z.number(),
});

const teamRow = z.object({
  id: z.string(),
  name: z.string(),
  days: z.number(),
  total: z.number(),
  topCategory: z.string().nullable(),
  medianMinutes: z.number().nullable(),
  onTimeRate: z.number().nullable(),
  reworkRate: z.number().nullable(),
  averageRating: z.number().nullable(),
  ratings: z.number(),
});

const monthlyReportSchema = z.object({
  version: z.literal(MONTHLY_REPORT_VERSION),
  title: z.string(),
  itemNoun: z.string(),
  empty: z.boolean(),
  indicators: z.array(indicatorRow),
  charts: z.array(chart),
  attention: z
    .object({
      title: z.string(),
      items: z.array(z.object({ label: z.string(), count: z.number(), base: z.string() })),
    })
    .nullable(),
  cases: z.array(caseTab),
  team: z.array(teamRow).nullable(),
  rules: z.array(z.object({ title: z.string(), text: z.string() })),
});

/** The stored report, or null when it is not one this version of the page can draw. */
export function parseStoredReport(payload: unknown): MonthlyReport | null {
  const parsed = monthlyReportSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }
  const report: MonthlyReport = parsed.data;
  return report;
}
