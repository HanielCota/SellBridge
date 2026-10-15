import { describe, expect, it } from "vitest";
import { storeHealth } from "./store-attention.ts";

describe("storeHealth", () => {
  it("asks for attention when a connected store kept the last failure", () => {
    expect(
      storeHealth({
        status: "connected",
        lastError: "Falha ao renovar o acesso da loja; tentaremos de novo",
      }),
    ).toBe("attention");
  });

  it("stays connected without an error, or with only blank text", () => {
    expect(storeHealth({ status: "connected", lastError: null })).toBe("connected");
    expect(storeHealth({ status: "connected", lastError: "  " })).toBe("connected");
  });

  it("keeps the status of a store that already stopped syncing", () => {
    expect(storeHealth({ status: "expired", lastError: "Token revogado" })).toBe("expired");
    expect(storeHealth({ status: "disconnected", lastError: "x" })).toBe("disconnected");
  });
});
