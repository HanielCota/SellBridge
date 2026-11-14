import { randomUUID } from "node:crypto";
import { logger } from "@sellbridge/shared/logger";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabase } from "./client.ts";
import { installProblemRecorder, type ProblemRecorder } from "./problem-recorder.ts";
import { problemEvents } from "./schema/index.ts";
import { createTestDatabase } from "./testing/fixtures.ts";

const database = createTestDatabase();
let recorder: ProblemRecorder | null = null;

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  recorder?.stop();
  recorder = null;
  vi.restoreAllMocks();
});

async function rowsOfEvent(event: string) {
  return database.select().from(problemEvents).where(eq(problemEvents.event, event));
}

describe("installProblemRecorder", () => {
  it("stores a logged error once, counting its repeats", async () => {
    const event = `test.recorder_${randomUUID()}`;
    recorder = installProblemRecorder(database, { service: "web" });

    logger.error(event, { tenantId: "org-1", error: new Error("timeout 1") });
    logger.error(event, { tenantId: "org-1", error: new Error("timeout 2") });
    await recorder.flush();

    const rows = await rowsOfEvent(event);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ service: "web", occurrences: 2, tenantId: "org-1" });
    await database.delete(problemEvents).where(eq(problemEvents.event, event));
  });

  it("stores no token, e-mail or CPF from the log fields", async () => {
    const event = `test.recorder_${randomUUID()}`;
    recorder = installProblemRecorder(database, { service: "worker" });

    logger.error(event, {
      refreshToken: "TG-secret-refresh-value",
      customerEmail: "ana@example.com",
      document: "123.456.789-09",
      error: new Error("buyer ana@example.com with CPF 12345678909 refused"),
    });
    await recorder.flush();

    const stored = JSON.stringify(await rowsOfEvent(event));
    expect(stored).toContain(event);
    expect(stored).not.toContain("TG-secret-refresh-value");
    expect(stored).not.toContain("ana@example.com");
    expect(stored).not.toContain("123.456.789-09");
    expect(stored).not.toContain("12345678909");
    await database.delete(problemEvents).where(eq(problemEvents.event, event));
  });

  it("never throws when the database is down, and reports the failure once", async () => {
    const unreachable = createDatabase("postgres://nobody:nothing@127.0.0.1:1/none");
    const failures: string[] = [];
    recorder = installProblemRecorder(unreachable, {
      service: "web",
      reportFailure: (line) => failures.push(line),
    });

    logger.error("test.recorder_down", { error: new Error("first") });
    await recorder.flush();
    logger.error("test.recorder_down", { error: new Error("second") });
    await recorder.flush();

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("problems.write_failed");
    await unreachable.$client.end({ timeout: 1 });
  });

  it("logging stays synchronous: nothing is written before the flush", async () => {
    const event = `test.recorder_${randomUUID()}`;
    recorder = installProblemRecorder(database, { service: "web" });

    logger.error(event);
    const beforeFlush = await rowsOfEvent(event);
    await recorder.flush();

    expect(beforeFlush).toHaveLength(0);
    expect(await rowsOfEvent(event)).toHaveLength(1);
    await database.delete(problemEvents).where(eq(problemEvents.event, event));
  });
});
