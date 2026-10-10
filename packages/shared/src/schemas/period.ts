import { z } from "zod";
import { withFallback, optionalParameter } from "./fallback.ts";

export const PERIOD_PRESETS = ["7d", "30d", "90d", "180d", "custom"] as const;
export const periodPresetSchema = z.enum(PERIOD_PRESETS);
export type PeriodPreset = z.infer<typeof periodPresetSchema>;

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
  "180d": "Últimos 6 meses",
  custom: "Personalizado",
};

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD");

export const periodSearchSchema = z.object({
  period: withFallback(periodPresetSchema.default("30d"), "30d"),
  from: optionalParameter(isoDateSchema),
  to: optionalParameter(isoDateSchema),
  store: optionalParameter(z.uuid()),
});
export type PeriodSearch = z.infer<typeof periodSearchSchema>;
