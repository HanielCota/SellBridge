import { z } from "zod";
import { optionalParameter } from "./fallback.ts";
import { isoDateSchema } from "./period.ts";

export const reportMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês no formato AAAA-MM");

/**
 * The period of a monthly report and of its downloads: a whole month (`mes`) or a range picked
 * on the calendar (`de` and `ate`). Missing or invalid values fall back to the current month.
 */
export const reportPeriodSearchSchema = z.object({
  mes: optionalParameter(reportMonthSchema),
  de: optionalParameter(isoDateSchema),
  ate: optionalParameter(isoDateSchema),
});
export type ReportPeriodSearch = z.infer<typeof reportPeriodSearchSchema>;
