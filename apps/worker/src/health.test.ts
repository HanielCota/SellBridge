import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startHealthServer } from "./health.ts";

let server: Server | null = null;

async function listening(checks: Parameters<typeof startHealthServer>[1]): Promise<string> {
  const started = startHealthServer(0, checks);
  server = started;
  await new Promise<void>((resolve) => started.once("listening", () => resolve()));
  const address = started.address();
  if (address === null || typeof address === "string") {
    throw new Error("servidor de health sem porta");
  }
  return `http://127.0.0.1:${(address satisfies AddressInfo).port}`;
}

beforeEach(() => {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  const current = server;
  server = null;
  if (current !== null) {
    await new Promise((resolve) => current.close(resolve));
  }
  vi.restoreAllMocks();
});

describe("worker health server", () => {
  it("answers 200 with each check while the worker and Redis are up", async () => {
    const url = await listening([
      { name: "worker", critical: true, run: async () => true },
      { name: "redis", critical: true, run: async () => true },
    ]);
    const response = await fetch(`${url}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      checks: { worker: "ok", redis: "ok" },
    });
  });

  it("answers 503 when Redis does not answer the ping", async () => {
    const url = await listening([
      { name: "worker", critical: true, run: async () => true },
      {
        name: "redis",
        critical: true,
        run: async () => {
          throw new Error("ECONNREFUSED");
        },
      },
    ]);
    const response = await fetch(`${url}/health`);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ checks: { redis: "unavailable" } });
  });

  it("answers 404 off /health", async () => {
    const url = await listening([]);
    expect((await fetch(`${url}/other`)).status).toBe(404);
  });
});
