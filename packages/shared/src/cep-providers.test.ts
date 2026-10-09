import { describe, expect, it, vi } from "vitest";
import { lookupCep } from "./cep-providers.ts";

type Route = { status: number; body: unknown } | "network-error";

function fakeFetch(routes: { brasilapi: Route; viacep: Route }) {
  return vi.fn<(url: string) => Promise<Response>>(async (url: string) => {
    const route = url.includes("brasilapi") ? routes.brasilapi : routes.viacep;
    if (route === "network-error") {
      throw new TypeError("fetch failed");
    }
    return new Response(JSON.stringify(route.body), { status: route.status });
  });
}

const brasilApiBody = {
  cep: "01001000",
  state: "SP",
  city: "São Paulo",
  neighborhood: "Sé",
  street: "Praça da Sé",
  service: "open-cep",
};

const viaCepBody = {
  cep: "01001-000",
  logradouro: "Praça da Sé",
  bairro: "Sé",
  localidade: "São Paulo",
  uf: "SP",
};

describe("lookupCep", () => {
  it("rejects invalid CEP without calling providers", async () => {
    const fetchImpl = fakeFetch({ brasilapi: "network-error", viacep: "network-error" });
    expect(await lookupCep("123", { fetchImpl })).toEqual({ ok: false, reason: "INVALID_CEP" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("resolves with BrasilAPI", async () => {
    const fetchImpl = fakeFetch({
      brasilapi: { status: 200, body: brasilApiBody },
      viacep: "network-error",
    });
    const result = await lookupCep("01001-000", { fetchImpl });
    expect(result).toMatchObject({
      ok: true,
      provider: "brasilapi",
      address: { cep: "01001000", state: "SP", city: "São Paulo", neighborhood: "Sé" },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("falls back to ViaCEP when BrasilAPI is down", async () => {
    const fetchImpl = fakeFetch({
      brasilapi: "network-error",
      viacep: { status: 200, body: viaCepBody },
    });
    const result = await lookupCep("01001000", { fetchImpl });
    expect(result).toMatchObject({ ok: true, provider: "viacep", address: { state: "SP" } });
  });

  it("falls back to ViaCEP when BrasilAPI returns an unexpected payload", async () => {
    const fetchImpl = fakeFetch({
      brasilapi: { status: 200, body: { state: "XX" } },
      viacep: { status: 200, body: viaCepBody },
    });
    expect(await lookupCep("01001000", { fetchImpl })).toMatchObject({ provider: "viacep" });
  });

  it("reports not found when ViaCEP confirms the BrasilAPI 404", async () => {
    const fetchImpl = fakeFetch({
      brasilapi: { status: 404, body: { message: "não encontrado" } },
      viacep: { status: 200, body: { erro: "true" } },
    });
    expect(await lookupCep("00000001", { fetchImpl })).toEqual({ ok: false, reason: "NOT_FOUND" });
  });

  it("reports not found from BrasilAPI 404 when ViaCEP is unavailable", async () => {
    const fetchImpl = fakeFetch({
      brasilapi: { status: 404, body: null },
      viacep: "network-error",
    });
    expect(await lookupCep("00000001", { fetchImpl })).toEqual({ ok: false, reason: "NOT_FOUND" });
  });

  it("reports provider failure when both providers fail", async () => {
    const fetchImpl = fakeFetch({
      brasilapi: { status: 500, body: null },
      viacep: { status: 503, body: null },
    });
    expect(await lookupCep("01001000", { fetchImpl })).toEqual({
      ok: false,
      reason: "PROVIDER_UNAVAILABLE",
    });
  });

  it("normalizes empty neighborhood and street to null", async () => {
    const fetchImpl = fakeFetch({
      brasilapi: { status: 200, body: { ...brasilApiBody, neighborhood: "", street: null } },
      viacep: "network-error",
    });
    const result = await lookupCep("01001000", { fetchImpl });
    expect(result).toMatchObject({ address: { neighborhood: null, street: null } });
  });
});
