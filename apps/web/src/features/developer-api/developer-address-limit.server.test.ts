import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/environment", () => ({
  environment: { BETTER_AUTH_SECRET: "test-secret", CLIENT_IP_HEADER: "x-forwarded-for" },
}));
vi.mock("@/lib/server/queues", async () => {
  const { createMemoryRateLimitStore } = await import("@/lib/server/auth-rate-limit");
  const store = createMemoryRateLimitStore();
  return { sharedRateLimitStore: () => store };
});

const { limitDeveloperAddress, DEVELOPER_REQUESTS_PER_ADDRESS_PER_MINUTE } =
  await import("./developer-address-limit.server");

function requestFrom(address: string): Request {
  return new Request("https://app.test/api/dev/v1/me", {
    headers: { "x-forwarded-for": address, authorization: "Bearer sb_dev_made-up" },
  });
}

describe("limitDeveloperAddress", () => {
  it("stops one address sending more calls than the limit, made-up keys included", async () => {
    for (let call = 0; call < DEVELOPER_REQUESTS_PER_ADDRESS_PER_MINUTE; call += 1) {
      await limitDeveloperAddress(requestFrom("203.0.113.9"));
    }

    const decision = await limitDeveloperAddress(requestFrom("203.0.113.9"));

    expect(decision).toMatchObject({ ok: false, problem: { status: 429 } });
  });

  it("keeps other addresses working", async () => {
    const decision = await limitDeveloperAddress(requestFrom("198.51.100.4"));

    expect(decision.ok).toBe(true);
  });
});
