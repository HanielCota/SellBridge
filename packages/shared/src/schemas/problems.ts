import { z } from "zod";
import { PROBLEM_AREAS } from "../domain/problem-areas.ts";
import { optionalParameter, withFallback } from "./fallback.ts";

/** How far back the admin "Problemas" list looks; problems are kept for 30 days. */
export const PROBLEM_PERIODS = ["24h", "7d", "30d"] as const;
export type ProblemPeriod = (typeof PROBLEM_PERIODS)[number];

export const PROBLEM_PERIOD_HOURS: Readonly<Record<ProblemPeriod, number>> = {
  "24h": 24,
  "7d": 7 * 24,
  "30d": 30 * 24,
};

export const PROBLEM_STATUSES = ["open", "resolved"] as const;
export type ProblemStatusFilter = (typeof PROBLEM_STATUSES)[number];

/** `/admin/problemas`: the filters live in the URL, so a link shows the same list. */
export const problemSearchSchema = z.object({
  status: withFallback(z.enum(PROBLEM_STATUSES).default("open"), "open"),
  area: optionalParameter(z.enum(PROBLEM_AREAS)),
  period: withFallback(z.enum(PROBLEM_PERIODS).default("7d"), "7d"),
});
export type ProblemSearchParams = z.infer<typeof problemSearchSchema>;

/** "<last seen ISO time>_<id>" of the previous page's last problem. */
const problemCursorSchema = z
  .string()
  .max(80)
  .regex(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z_[0-9a-f-]{36}$/i, "Página inválida");

export const problemPageRequestSchema = problemSearchSchema.extend({
  cursor: problemCursorSchema.optional(),
});
export type ProblemPageRequest = z.infer<typeof problemPageRequestSchema>;

export const problemIdSchema = z.object({ problemId: z.uuid() });

export const setProblemResolvedSchema = z.object({
  problemId: z.uuid(),
  /** False reopens it (the "Desfazer" on the notice). */
  resolved: z.boolean(),
});
