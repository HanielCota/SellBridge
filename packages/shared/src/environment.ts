import type { z } from "zod";
import { configurationError } from "./errors.ts";

/**
 * Validates environment variables against a Zod schema at startup.
 * Throws a ConfigurationError listing every invalid or missing variable.
 */
export function parseEnvironment<TSchema extends z.ZodType>(
  schema: TSchema,
  source: Record<string, string | undefined>,
): z.infer<TSchema> {
  const parsed = schema.safeParse(source);
  if (parsed.success) {
    return parsed.data;
  }
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(raiz)"}: ${issue.message}`)
    .join("\n");
  throw configurationError(`Variáveis de ambiente inválidas:\n${details}`);
}
