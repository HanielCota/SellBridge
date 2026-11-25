import { describe, expect, it } from "vitest";
import { developerScopesSchema, knownDeveloperScopes } from "./scopes.ts";

describe("developerScopesSchema", () => {
  it("accepts orders with the buyer's personal data", () => {
    const parsed = developerScopesSchema.safeParse(["orders:read", "buyers:personal"]);

    expect(parsed.success).toBe(true);
  });

  it("refuses the buyer's personal data without orders", () => {
    const parsed = developerScopesSchema.safeParse(["buyers:personal"]);

    expect(parsed.success).toBe(false);
  });

  it("refuses an empty list", () => {
    const parsed = developerScopesSchema.safeParse([]);

    expect(parsed.success).toBe(false);
  });

  it("refuses a scope that does not exist", () => {
    const parsed = developerScopesSchema.safeParse(["orders:write"]);

    expect(parsed.success).toBe(false);
  });

  it("removes repeated scopes", () => {
    const parsed = developerScopesSchema.parse(["stores:read", "stores:read"]);

    expect(parsed).toEqual(["stores:read"]);
  });
});

describe("knownDeveloperScopes", () => {
  it("keeps only scopes that still exist", () => {
    const scopes = knownDeveloperScopes(["stores:read", "old:scope"]);

    expect(scopes).toEqual(["stores:read"]);
  });
});
