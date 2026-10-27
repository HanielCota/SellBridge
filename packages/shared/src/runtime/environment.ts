import { z } from "zod";
import {
  SHOPEE_SHOWCASE_DEFAULT_UNITS,
  SHOPEE_SHOWCASE_MAX_UNITS,
} from "../domain/marketplace-units.ts";
import { configurationError } from "./errors.ts";

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

/** LOG_LEVEL accepted in any case (`INFO`, `Info`...) and normalized to lowercase. */
export const logLevelEnvironmentSchema = z
  .string()
  .default("info")
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.enum(LOG_LEVELS));

/**
 * On/off flag, off unless set to "true" or "1". `z.coerce.boolean()` would read "false" as
 * true (any non-empty string), which is the wrong default for a security switch.
 */
export const booleanFlagEnvironmentSchema = z
  .string()
  .default("false")
  .transform((value) => ["true", "1"].includes(value.trim().toLowerCase()));

export const nodeEnvironmentSchema = z
  .enum(["development", "test", "production"])
  .default("development");

/** AES-256 key for the store tokens at rest: 32 bytes, base64-encoded. */
export const tokenEncryptionKeyEnvironmentSchema = z
  .string()
  .refine((value) => Buffer.from(value, "base64").length === 32, {
    message: "deve ser uma chave de 32 bytes em base64",
  });

/**
 * Chat webhook that receives error logs (item 32.a); unset keeps alerts off. HTTPS only: the
 * alert carries the log line, already redacted, and must not travel in clear text.
 */
export const alertWebhookUrlEnvironmentSchema = z.url({ protocol: /^https$/ }).optional();

/**
 * SHOPEE_SHOWCASE_UNITS: units Shopee listings show on top of the real ones (worker and web).
 * A whole number from 0 (off) to 100000; a negative or fractional value fails startup.
 */
export const shopeeShowcaseUnitsEnvironmentSchema = z.coerce
  .number()
  .int()
  .min(0)
  .max(SHOPEE_SHOWCASE_MAX_UNITS)
  .default(SHOPEE_SHOWCASE_DEFAULT_UNITS);

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
 * `NAME=` with nothing after it means "not set", as in any .env file: optional variables left
 * blank (the .env.example ships several) fall back to their default instead of failing a
 * minimum-length rule.
 */
function withoutBlankValues(
  source: Record<string, string | undefined>,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value === undefined || value.trim() !== ""),
  );
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
  const present = withoutBlankValues(source);
  const renamedIssues = renamedVariableIssues(present, options.renamedVariables ?? {});
  const parsed = schema.safeParse(present);
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
