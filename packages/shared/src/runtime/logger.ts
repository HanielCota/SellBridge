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
const SENSITIVE_KEY_PATTERN = /token|secret|password|authorization|cookie|email/i;
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
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
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
