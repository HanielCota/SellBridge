import { describe, expect, it, vi } from "vitest";
import { lookUpCep, parseViaCepReply, type FetchCep } from "./cep-lookup";

const VIA_CEP_REPLY = {
  cep: "35500-024",
  logradouro: "Rua Goiás",
  complemento: "",
  bairro: "Centro",
  localidade: "Divinópolis",
  uf: "MG",
  ibge: "3122306",
};

function jsonReply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("parseViaCepReply", () => {
  it("reads street, district, city, state and IBGE code", () => {
    expect(parseViaCepReply(VIA_CEP_REPLY)).toEqual({
      kind: "found",
      address: {
        street: "Rua Goiás",
        neighborhood: "Centro",
        city: "Divinópolis",
        state: "MG",
        ibgeCode: "3122306",
      },
    });
  });

  it("tells a CEP that does not exist apart from an odd reply", () => {
    expect(parseViaCepReply({ erro: "true" })).toEqual({ kind: "not_found" });
    expect(parseViaCepReply({ erro: true })).toEqual({ kind: "not_found" });
    expect(parseViaCepReply({ ...VIA_CEP_REPLY, ibge: "31" })).toEqual({ kind: "unavailable" });
    expect(parseViaCepReply({ ...VIA_CEP_REPLY, uf: "XX" })).toEqual({ kind: "unavailable" });
  });
});

describe("lookUpCep", () => {
  it("asks ViaCEP with the CEP's digits only", async () => {
    const fetchCep = vi.fn<FetchCep>(async () => jsonReply(VIA_CEP_REPLY));

    const result = await lookUpCep("35500-024", fetchCep);

    expect(fetchCep).toHaveBeenCalledWith(
      "https://viacep.com.br/ws/35500024/json/",
      expect.anything(),
    );
    expect(result.kind).toBe("found");
  });

  it("does not ask for a CEP without 8 digits", async () => {
    const fetchCep = vi.fn<FetchCep>(async () => jsonReply(VIA_CEP_REPLY));

    const result = await lookUpCep("3550", fetchCep);

    expect(result).toEqual({ kind: "not_found" });
    expect(fetchCep).not.toHaveBeenCalled();
  });

  it("reads a failed or unreachable service as unavailable, never as an error", async () => {
    const failing = vi.fn<FetchCep>(async () => jsonReply({}, 503));
    const offline = vi.fn<FetchCep>(async () => {
      throw new TypeError("Failed to fetch");
    });

    expect(await lookUpCep("35500024", failing)).toEqual({ kind: "unavailable" });
    expect(await lookUpCep("35500024", offline)).toEqual({ kind: "unavailable" });
  });

  it("reads ViaCEP's 400 for a malformed CEP as not found", async () => {
    const fetchCep = vi.fn<FetchCep>(async () => jsonReply({}, 400));

    expect(await lookUpCep("35500024", fetchCep)).toEqual({ kind: "not_found" });
  });
});
