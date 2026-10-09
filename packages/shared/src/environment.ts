import { z } from "zod";
import { configurationError } from "./errors.ts";

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

/** LOG_LEVEL accepted in any case (`INFO`, `Info`...) and normalized to lowercase. */
export const logLevelEnvironmentSchema = z
  .string()
  .default("info")
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.enum(LOG_LEVELS));

export interface ParseEnvironmentOptions {
  /** Old variable name → new name. Setting an old name fails startup instead of being ignored. */
  renamedVariables?: Readonly<Record<string, string>>;
}

function renamedVariableIssues(
  source: Record<string, string | undefined>,
  renamedVariables: Readonly<Record<string, string>>,
): string[] {
  return Object.entries(renamedVariables)
    .filter(([oldName]) => source[oldName] !== undefined)
    .map(([oldName, newName]) => `  - ${oldName}: foi renomeada para ${newName}`);
}

/**
 * Validates environment variables against a Zod schema at startup.
 * Throws a configuration error listing every invalid, missing or renamed variable.
 */
export function parseEnvironment<TSchema extends z.ZodType>(
  schema: TSchema,
  source: Record<string, string | undefined>,
  options: ParseEnvironmentOptions = {},
): z.infer<TSchema> {
  const renamedIssues = renamedVariableIssues(source, options.renamedVariables ?? {});
  const parsed = schema.safeParse(source);
  if (parsed.success && renamedIssues.length === 0) {
    return parsed.data;
  }
  const schemaIssues = parsed.success
    ? []
    : parsed.error.issues.map(
        (issue) => `  - ${issue.path.join(".") || "(raiz)"}: ${issue.message}`,
      );
  const details = [...schemaIssues, ...renamedIssues].join("\n");
  throw configurationError(`Variáveis de ambiente inválidas:\n${details}`);
}
