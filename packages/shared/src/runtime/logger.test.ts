import { afterEach, describe, expect, it, vi } from "vitest";
import { addProblemLogListener, logger, type ProblemLogEntry } from "./logger.ts";

/** Same shape as drizzle-orm's DrizzleQueryError: the values are in the message and the stack. */
class FailedQuery extends Error {
  readonly query = 'insert into "orders" ("buyer_name") values ($1)';
  readonly params = ["Maria Silva, Rua das Flores 10"];
  constructor(override readonly cause: Error) {
    super('Failed query: insert into "orders"\nparams: Maria Silva, Rua das Flores 10');
  }
}

/** The line the logger writes to stderr while `log` runs. */
function stderrLine(log: () => void): string {
  const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  log();
  return String(write.mock.calls.at(-1)?.[0] ?? "");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logger", () => {
  it("keeps the values of a failed query out of the logs, with the database error code", () => {
    const cause = Object.assign(new Error("duplicate key"), { code: "23505" });
    const line = stderrLine(() =>
      logger.error("order.save_failed", { error: new FailedQuery(cause) }),
    );
    expect(line).not.toContain("Maria Silva");
    expect(line).toContain("23505");
    expect(line).toContain("parâmetros omitidos");
  });

  it("redacts personal fields by name", () => {
    const line = stderrLine(() =>
      logger.warn("profile.updated", { cpf: "123.456.789-00", phoneNumber: "11999990000" }),
    );
    expect(line).not.toContain("123.456.789-00");
    expect(line).not.toContain("11999990000");
  });

  it("tells every listener about warnings and errors, but not about info", () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const first: ProblemLogEntry[] = [];
    const second: ProblemLogEntry[] = [];
    const stopFirst = addProblemLogListener((entry) => first.push(entry));
    const stopSecond = addProblemLogListener((entry) => second.push(entry));

    logger.info("order.saved");
    logger.warn("order.slow");
    logger.error("order.failed");
    stopFirst();
    stopSecond();

    expect(first.map((entry) => `${entry.level}:${entry.event}`)).toEqual([
      "warn:order.slow",
      "error:order.failed",
    ]);
    expect(second).toHaveLength(2);
  });

  it("does not feed a listener the entries it logs itself", () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const heard: string[] = [];
    const stop = addProblemLogListener((entry) => {
      heard.push(entry.event);
      logger.error("listener.echo");
    });

    logger.error("order.failed");
    stop();

    expect(heard).toEqual(["order.failed"]);
  });
});
