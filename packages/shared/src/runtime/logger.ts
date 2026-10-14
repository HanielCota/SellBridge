import { LOG_LEVELS, logLevelEnvironmentSchema } from "./environment.ts";
import { withFallback } from "../schemas/fallback.ts";

type LogLevel = (typeof LOG_LEVELS)[number];

type LogFields = Readonly<Record<string, unknown>>;

const LEVEL_PRIORITY: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** Keys whose values never reach the logs, matched case-insensitively anywhere in the key. */
const SENSITIVE_KEY_PATTERN =
  /token|secret|password|authorization|cookie|email|cpf|cnpj|phone|address|verifier/i;
const REDACTED = "[redacted]";

const logLevelSchema = withFallback(logLevelEnvironmentSchema, "info");

function minimumLevel(): LogLevel {
  return logLevelSchema.parse(process.env.LOG_LEVEL);
}

function serializeValue(key: string, value: unknown): unknown {
  if (key !== "" && SENSITIVE_KEY_PATTERN.test(key)) {
    return REDACTED;
  }
  if (value instanceof Error) {
    return serializeError(value);
  }
  return value;
}

/** A Postgres error code ("23505") or a Node one ("ECONNREFUSED"), when the error carries one. */
function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

/** Drizzle's failed query (it sets no `name`): carries the SQL and the values bound to it. */
function isFailedQuery(error: Error): boolean {
  return "query" in error && "params" in error;
}

/**
 * A failed query's message and stack start with "Failed query: <sql>\nparams: <values>": the values
 * are the rows being written (buyer address, ticket text, encrypted tokens). Such an error is
 * logged with the database error code and the stack frames only.
 */
function serializeError(error: Error): Record<string, unknown> {
  if (!isFailedQuery(error)) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  const frames = (error.stack ?? "")
    .split("\n")
    .filter((line) => line.trimStart().startsWith("at "));
  return {
    name: "DrizzleQueryError",
    code: errorCode(error.cause),
    message: "Falha na consulta ao banco (parâmetros omitidos)",
    stack: frames.join("\n"),
  };
}

function write(level: LogLevel, event: string, fields: LogFields): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[minimumLevel()]) {
    return;
  }
  const entry = { level, event, time: new Date().toISOString(), ...fields };
  const line = `${JSON.stringify(entry, serializeValue)}\n`;
  if (level === "error" || level === "warn") {
    process.stderr.write(line);
    return;
  }
  process.stdout.write(line);
}

export const logger = {
  debug: (event: string, fields: LogFields = {}) => write("debug", event, fields),
  info: (event: string, fields: LogFields = {}) => write("info", event, fields),
  warn: (event: string, fields: LogFields = {}) => write("warn", event, fields),
  error: (event: string, fields: LogFields = {}) => write("error", event, fields),
};
