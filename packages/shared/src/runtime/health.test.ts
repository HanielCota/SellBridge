import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runHealthChecks } from "./health.ts";
import { logger } from "./logger.ts";

const ok = async () => true;
const down = async () => false;

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(logger, "error");
  vi.spyOn(logger, "warn");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runHealthChecks", () => {
  it("answers 200 ok when every check passes", async () => {
    const report = await runHealthChecks([
      { name: "database", critical: true, run: ok },
      { name: "redis", critical: false, run: ok },
    ]);
    expect(report).toEqual({
      httpStatus: 200,
      body: { status: "ok", checks: { database: "ok", redis: "ok" } },
    });
  });

  it("answers 503 when a critical check fails", async () => {
    const report = await runHealthChecks([
      { name: "worker", critical: true, run: ok },
      { name: "redis", critical: true, run: down },
    ]);
    expect(report.httpStatus).toBe(503);
    expect(logger.error).toHaveBeenCalledWith("health.check_failed", { check: "redis" });
    expect(report.body).toEqual({
      status: "unavailable",
      checks: { worker: "ok", redis: "unavailable" },
    });
  });

  it("stays up but degraded when only a non-critical check fails", async () => {
    const report = await runHealthChecks([
      { name: "database", critical: true, run: ok },
      { name: "redis", critical: false, run: down },
    ]);
    expect(report.httpStatus).toBe(200);
    expect(report.body.status).toBe("degraded");
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith("health.check_failed", { check: "redis" });
  });

  it("counts a check that throws or hangs past the deadline as unavailable", async () => {
    const report = await runHealthChecks(
      [
        {
          name: "database",
          critical: false,
          run: async () => {
            throw new Error("connection refused");
          },
        },
        { name: "redis", critical: false, run: async () => new Promise<boolean>(() => undefined) },
      ],
      { timeoutMilliseconds: 20 },
    );
    expect(report.body.checks).toEqual({ database: "unavailable", redis: "unavailable" });
  });
});
