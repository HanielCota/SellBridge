import { validationError } from "@sellbridge/shared/errors";
import {
  MAX_REPORT_YEAR,
  MIN_REPORT_YEAR,
  resolvePeriod,
  type ResolvedPeriod,
} from "@sellbridge/shared/period-range";
import { z } from "zod";

/**
 * `true`/`false` in the query string. `z.coerce.boolean()` would read the text "false" as
 * true, so only the two literal words are accepted.
 */
export const queryBooleanSchema = z.enum(["true", "false"]).transform((value) => value === "true");

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD");

/** `from`/`to` of every report-like list; both or neither, in Brazil calendar days. */
export const periodQuerySchema = z.object({
  from: isoDateSchema
    .optional()
    .describe(
      "Primeiro dia do período (AAAA-MM-DD, horário de Brasília). Informe junto com `to`; sem os dois, vale os últimos 30 dias.",
    ),
  to: isoDateSchema
    .optional()
    .describe("Último dia do período, inclusive (AAAA-MM-DD). Máximo de 366 dias."),
});

export type PeriodQuery = z.infer<typeof periodQuerySchema>;

/** The period search the report helpers take; always a preset or a custom range. */
export interface ApiPeriodSearch {
  period: "30d" | "custom";
  from?: string;
  to?: string;
}

/**
 * Turns `from`/`to` into the report period. The dashboard silently falls back to 30 days on
 * a bad range; an integration must instead learn its range was rejected, so any range the
 * shared resolver would not honour as given is a validation error.
 */
export function resolveApiPeriod(
  query: PeriodQuery,
  now: Date,
): { search: ApiPeriodSearch; period: ResolvedPeriod } {
  if (query.from === undefined && query.to === undefined) {
    const search: ApiPeriodSearch = { period: "30d" };
    return { search, period: resolvePeriod(search, now) };
  }
  if (query.from === undefined || query.to === undefined) {
    throw validationError("Informe `from` e `to` juntos, ou nenhum dos dois.");
  }
  const search: ApiPeriodSearch = { period: "custom", from: query.from, to: query.to };
  const period = resolvePeriod(search, now);
  if (period.fromDate !== query.from || period.toDate !== query.to) {
    throw validationError(
      `Período inválido: use datas reais entre ${MIN_REPORT_YEAR} e ${MAX_REPORT_YEAR}, \`to\` igual ou depois de \`from\` e no máximo 366 dias.`,
    );
  }
  return { search, period };
}
