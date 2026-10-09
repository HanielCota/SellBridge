type LogLevel = "debug" | "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

function write(level: LogLevel, event: string, fields: LogFields): void {
  const entry = { level, event, time: new Date().toISOString(), ...fields };
  const line = JSON.stringify(entry, (_key, value: unknown) =>
    value instanceof Error
      ? { name: value.name, message: value.message, stack: value.stack }
      : value,
  );
  if (level === "error" || level === "warn") {
    console.error(line);
    return;
  }
  console.log(line);
}

export const logger = {
  debug: (event: string, fields: LogFields = {}) => write("debug", event, fields),
  info: (event: string, fields: LogFields = {}) => write("info", event, fields),
  warn: (event: string, fields: LogFields = {}) => write("warn", event, fields),
  error: (event: string, fields: LogFields = {}) => write("error", event, fields),
};
