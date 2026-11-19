import { describe, expect, it } from "vitest";
import { createCnpjLookup } from "./cnpj-lookup.ts";

const CNPJ = "11222333000181";
const BASE_URL = "https://cnpj.example.test/api/cnpj/v1/";

function answering(status: number, body: unknown) {
  const requested: string[] = [];
  const fetchImplementation: typeof fetch = async (input) => {
    requested.push(input instanceof Request ? input.url : input.toString());
    return new Response(JSON.stringify(body), { status });
  };
  return { requested, lookUp: createCnpjLookup({ baseUrl: BASE_URL, fetchImplementation }) };
}

describe("createCnpjLookup", () => {
  it("reads an active company with its legal name", async () => {
    const { requested, lookUp } = answering(200, {
      razao_social: "CASA DAS PANELAS LTDA",
      situacao_cadastral: 2,
      descricao_situacao_cadastral: "ATIVA",
    });

    const result = await lookUp(CNPJ);

    expect(requested).toEqual([`https://cnpj.example.test/api/cnpj/v1/${CNPJ}`]);
    expect(result).toEqual({
      outcome: "active",
      legalName: "CASA DAS PANELAS LTDA",
      registrationStatus: "ATIVA",
    });
  });

  it("reads a closed company as inactive", async () => {
    const { lookUp } = answering(200, {
      razao_social: "CASA DAS PANELAS LTDA",
      situacao_cadastral: 8,
      descricao_situacao_cadastral: "BAIXADA",
    });

    const result = await lookUp(CNPJ);

    expect(result).toMatchObject({ outcome: "inactive", registrationStatus: "BAIXADA" });
  });

  it("reads 404 as a CNPJ the Receita does not know", async () => {
    const { lookUp } = answering(404, { message: "CNPJ não encontrado" });

    expect(await lookUp(CNPJ)).toEqual({ outcome: "not_found" });
  });

  it("reads 400 as a CNPJ the query does not accept", async () => {
    const { lookUp } = answering(400, { message: "CNPJ inválido" });

    expect(await lookUp(CNPJ)).toEqual({ outcome: "unsupported" });
  });

  it("reads a 503 as the query being down", async () => {
    const { lookUp } = answering(503, { message: "timeout" });

    expect(await lookUp(CNPJ)).toEqual({ outcome: "unavailable" });
  });

  it("reads a rate limit as the query being down", async () => {
    const { lookUp } = answering(429, {});

    expect(await lookUp(CNPJ)).toEqual({ outcome: "unavailable" });
  });

  it("reads an answer without the expected fields as the query being down", async () => {
    const { lookUp } = answering(200, { nome: "outro formato" });

    expect(await lookUp(CNPJ)).toEqual({ outcome: "unavailable" });
  });

  it("reads a network failure as the query being down", async () => {
    const lookUp = createCnpjLookup({
      baseUrl: BASE_URL,
      fetchImplementation: async () => {
        throw new TypeError("fetch failed");
      },
    });

    expect(await lookUp(CNPJ)).toEqual({ outcome: "unavailable" });
  });
});
