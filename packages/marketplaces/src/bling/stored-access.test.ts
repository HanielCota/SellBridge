import { createTokenCipher } from "@sellbridge/shared/token-cipher";
import { describe, expect, it, vi } from "vitest";
import { storedBlingAccess, type BlingConnectionStore } from "./stored-access.ts";

const cipher = createTokenCipher(Buffer.alloc(32, 7).toString("base64"));
const credentials = { clientId: "id", clientSecret: "secret" };

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

function storeWith(status = "connected") {
  const saved = {
    id: "connection-1",
    status,
    accessTokenEnc: cipher.encrypt("access-old"),
    refreshTokenEnc: cipher.encrypt("refresh-old"),
    expiresAt: new Date(0),
  };
  const store: BlingConnectionStore = {
    load: async () => saved,
    rotate: vi.fn<BlingConnectionStore["rotate"]>(async () => true),
    markExpired: vi.fn<BlingConnectionStore["markExpired"]>(async () => {}),
  };
  return { store, saved };
}

describe("storedBlingAccess", () => {
  it("decrypts the saved tokens", async () => {
    const { store } = storeWith();
    const access = storedBlingAccess({
      accountKey: "s1",
      credentials,
      cipher,
      store,
      fetchImplementation: vi.fn<typeof fetch>(),
    });

    const tokens = await access.currentTokens();

    expect(tokens.accessToken).toBe("access-old");
  });

  it("saves the refreshed tokens against the refresh token it used", async () => {
    const { store, saved } = storeWith();
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      json(200, {
        access_token: "a2",
        refresh_token: "r2",
        expires_in: 21600,
        token_type: "Bearer",
      }),
    );
    const access = storedBlingAccess({
      accountKey: "s1",
      credentials,
      cipher,
      store,
      fetchImplementation,
    });

    const tokens = await access.refresh();

    expect(tokens.accessToken).toBe("a2");
    const [connectionId, previous, encrypted] = vi.mocked(store.rotate).mock.calls[0] ?? [];
    expect([connectionId, previous]).toEqual(["connection-1", saved.refreshTokenEnc]);
    expect(cipher.decrypt(encrypted?.refreshTokenEnc ?? "")).toBe("r2");
  });

  it("marks the connection expired when Bling refuses the refresh token", async () => {
    const { store } = storeWith();
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      json(400, { error: { type: "invalid_grant", message: "x" } }),
    );
    const access = storedBlingAccess({
      accountKey: "s1",
      credentials,
      cipher,
      store,
      fetchImplementation,
    });

    await expect(access.refresh()).rejects.toThrow("Conecte o Bling de novo");
    expect(store.markExpired).toHaveBeenCalledTimes(1);
  });

  it("asks to connect again when the connection is not connected", async () => {
    const { store } = storeWith("expired");
    const access = storedBlingAccess({
      accountKey: "s1",
      credentials,
      cipher,
      store,
      fetchImplementation: vi.fn<typeof fetch>(),
    });

    await expect(access.currentTokens()).rejects.toThrow("Conecte o Bling de novo");
  });
});
