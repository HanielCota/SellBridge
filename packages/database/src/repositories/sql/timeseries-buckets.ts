import { sql, type SQL } from "drizzle-orm";

/** How the sales timeseries is grouped, in Brazil time. */
export type TimeseriesBucket = "hour" | "day" | "week" | "month";

const DATE_LABEL = sql.raw("'YYYY-MM-DD'");

/** Hours are labeled "2026-10-16T14:00"; longer buckets by their first day. */
export const BUCKET_SQL: Record<TimeseriesBucket, { unit: SQL; step: SQL; label: SQL }> = {
  hour: {
    unit: sql.raw("'hour'"),
    step: sql.raw("interval '1 hour'"),
    label: sql.raw(`'YYYY-MM-DD"T"HH24:00'`),
  },
  day: { unit: sql.raw("'day'"), step: sql.raw("interval '1 day'"), label: DATE_LABEL },
  week: { unit: sql.raw("'week'"), step: sql.raw("interval '1 week'"), label: DATE_LABEL },
  month: { unit: sql.raw("'month'"), step: sql.raw("interval '1 month'"), label: DATE_LABEL },
};
