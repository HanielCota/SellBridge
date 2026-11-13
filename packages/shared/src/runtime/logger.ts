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

/** Whether a field's value never reaches the logs because of its name ("accessToken", "email"). */
export function isSensitiveLogKey(key: string): boolean {
  return key !== "" && SENSITIVE_KEY_PATTERN.test(key);
}

const logLevelSchema = withFallback(logLevelEnvironmentSchema, "info");

function minimumLevel(): LogLevel {
  return logLevelSchema.parse(process.env.LOG_LEVEL);
}

function serializeValue(key: string, value: unknown): unknown {
  if (isSensitiveLogKey(key)) {
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

/** A warning or error entry as written: `line` is the JSON already redacted. */
export interface ProblemLogEntry {
  readonly level: "warn" | "error";
  readonly event: string;
  readonly line: string;
}

/** The error alerts and the problem recorder (admin "Problemas") listen side by side. */
const problemLogListeners = new Set<(entry: ProblemLogEntry) => void>();
let notifying = false;

/** Hears every warning and error entry; returns the function that stops listening. */
export function addProblemLogListener(listener: (entry: ProblemLogEntry) => void): () => void {
  problemLogListeners.add(listener);
  return () => {
    problemLogListeners.delete(listener);
  };
}

/**
 * A failing listener must never break the caller that was only logging. A listener that logs
 * while it runs is not heard again, so a listener can never feed itself.
 */
function notifyProblemListeners(entry: ProblemLogEntry): void {
  if (notifying || problemLogListeners.size === 0) {
    return;
  }
  notifying = true;
  try {
    for (const listener of problemLogListeners) {
      notifyOne(listener, entry);
    }
  } finally {
    notifying = false;
  }
}

function notifyOne(listener: (entry: ProblemLogEntry) => void, entry: ProblemLogEntry): void {
  try {
    listener(entry);
  } catch (error) {
    const failure = { level: "warn", event: "logger.listener_failed", error: String(error) };
    process.stderr.write(`${JSON.stringify(failure)}
`);
  }
}

function write(level: LogLevel, event: string, fields: LogFields): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[minimumLevel()]) {
    return;
  }
  const entry = { level, event, time: new Date().toISOString(), ...fields };
  const line = `${JSON.stringify(entry, serializeValue)}\n`;
  if (level === "error" || level === "warn") {
    process.stderr.write(line);
    notifyProblemListeners({ level, event, line: line.trimEnd() });
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
