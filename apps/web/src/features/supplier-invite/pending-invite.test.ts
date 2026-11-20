import { afterEach, describe, expect, it, vi } from "vitest";
import { forgetPendingInvite, pendingInvite, rememberPendingInvite } from "./pending-invite";

const TOKEN = `0b7a4d2e-3c1f-4a5b-9c8d-7e6f5a4b3c2d.1796247080.${"a".repeat(64)}`;

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pending supplier invite", () => {
  it("brings back the invite it kept, until it is forgotten", () => {
    vi.stubGlobal("localStorage", memoryStorage());

    rememberPendingInvite(TOKEN);
    const kept = pendingInvite();
    forgetPendingInvite();

    expect(kept).toBe(TOKEN);
    expect(pendingInvite()).toBeNull();
  });

  it("ignores something that is not an invite", () => {
    vi.stubGlobal("localStorage", memoryStorage());

    rememberPendingInvite("javascript:alert(1)");

    expect(pendingInvite()).toBeNull();
  });

  it("works without storage, as in a private window", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });

    expect(rememberPendingInvite(TOKEN)).toBe(false);
    expect(pendingInvite()).toBeNull();
  });
});
