import { describe, expect, it } from "vitest";
import {
  apiKeyCurlExample,
  apiKeyStatus,
  createApiKeyInputSchema,
  knownApiScopes,
  toCreateApiKeyInput,
} from "./api-keys";

const NOW = new Date("2026-10-11T12:00:00.000Z");

describe("apiKeyStatus", () => {
  it("is active without revocation or past expiration", () => {
    expect(apiKeyStatus({ revokedAt: null, expiresAt: null }, NOW)).toBe("active");
    expect(
      apiKeyStatus({ revokedAt: null, expiresAt: new Date("2026-10-12T00:00:00Z") }, NOW),
    ).toBe("active");
  });

  it("is expired once the expiration has passed", () => {
    expect(apiKeyStatus({ revokedAt: null, expiresAt: NOW }, NOW)).toBe("expired");
  });

  it("reports revoked even when the key has also expired", () => {
    expect(apiKeyStatus({ revokedAt: new Date("2026-01-01T00:00:00Z"), expiresAt: NOW }, NOW)).toBe(
      "revoked",
    );
  });
});

describe("toCreateApiKeyInput", () => {
  it("turns the chosen period into an expiration date", () => {
    const input = toCreateApiKeyInput(
      { name: "  ERP  ", scopes: ["orders:read"], expiration: "30" },
      NOW,
    );
    expect(input).toEqual({
      name: "ERP",
      scopes: ["orders:read"],
      expiresAt: "2026-11-10T12:00:00.000Z",
    });
  });

  it("keeps no expiration when the person chooses never", () => {
    const input = toCreateApiKeyInput(
      { name: "ERP", scopes: ["orders:read"], expiration: "never" },
      NOW,
    );
    expect(input.expiresAt).toBeNull();
  });
});

describe("createApiKeyInputSchema", () => {
  it("requires a name of up to 60 characters", () => {
    const base = { scopes: ["orders:read"], expiresAt: null };
    expect(createApiKeyInputSchema.safeParse({ ...base, name: "   " }).success).toBe(false);
    expect(createApiKeyInputSchema.safeParse({ ...base, name: "a".repeat(61) }).success).toBe(
      false,
    );
    expect(createApiKeyInputSchema.safeParse({ ...base, name: "a".repeat(60) }).success).toBe(true);
  });

  it("requires at least one known scope and drops duplicates", () => {
    const base = { name: "ERP", expiresAt: null };
    expect(createApiKeyInputSchema.safeParse({ ...base, scopes: [] }).success).toBe(false);
    expect(createApiKeyInputSchema.safeParse({ ...base, scopes: ["admin:all"] }).success).toBe(
      false,
    );
    const parsed = createApiKeyInputSchema.parse({
      ...base,
      scopes: ["orders:read", "orders:read"],
    });
    expect(parsed.scopes).toEqual(["orders:read"]);
  });
});

describe("knownApiScopes", () => {
  it("ignores scopes that no longer exist", () => {
    expect(knownApiScopes(["orders:read", "legacy:scope"])).toEqual(["orders:read"]);
  });
});

describe("apiKeyCurlExample", () => {
  it("calls /me with the key as a bearer token", () => {
    expect(apiKeyCurlExample("https://app.example", "sb_live_x")).toBe(
      'curl https://app.example/api/v1/me -H "Authorization: Bearer sb_live_x"',
    );
  });
});
