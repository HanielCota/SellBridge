import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@sellbridge/database/repositories", () => ({}));

const { decideDeveloperRateLimit } = await import("./developer-rate-limit.server");

const NOW = new Date("2026-11-25T12:00:30Z");

describe("decideDeveloperRateLimit", () => {
  it("lets a key under both limits through", () => {
    const decision = decideDeveloperRateLimit({ keyRequests: 10, creatorRequests: 30, now: NOW });

    expect(decision.ok).toBe(true);
  });

  it("stops a developer whose keys together pass the per-developer limit", () => {
    const decision = decideDeveloperRateLimit({ keyRequests: 40, creatorRequests: 121, now: NOW });

    expect(decision).toMatchObject({ ok: false, problem: { status: 429 } });
  });

  it("stops a key past its own limit", () => {
    const decision = decideDeveloperRateLimit({ keyRequests: 61, creatorRequests: 61, now: NOW });

    expect(decision).toMatchObject({ ok: false, problem: { status: 429 } });
  });
});
