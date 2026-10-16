import { describe, expect, it } from "vitest";
import { describeStoreAccess, storeHealth } from "./store-attention.ts";

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

describe("describeStoreAccess", () => {
  it("calls a connected store's access fine: the token renews by itself", () => {
    expect(describeStoreAccess({ status: "connected", lastError: null })).toEqual({
      label: "Em dia, renova sozinho",
      tone: "success",
    });
  });

  it("says a failed renewal is being retried", () => {
    expect(describeStoreAccess({ status: "connected", lastError: "Instabilidade" })).toEqual({
      label: "Renovação falhou, tentaremos de novo",
      tone: "warning",
    });
  });

  it("asks for a reconnection once the access is lost", () => {
    expect(describeStoreAccess({ status: "expired", lastError: null })).toEqual({
      label: "Expirado, reconecte a loja",
      tone: "warning",
    });
    expect(describeStoreAccess({ status: "error", lastError: null })).toEqual({
      label: "Com erro, reconecte a loja",
      tone: "danger",
    });
    expect(describeStoreAccess({ status: "disconnected", lastError: null })).toEqual({
      label: "Desconectada",
      tone: "muted",
    });
  });
});
