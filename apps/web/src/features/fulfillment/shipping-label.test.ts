import { describe, expect, it } from "vitest";
import { parseShippingLabel } from "./shipping-label";

describe("parseShippingLabel", () => {
  it("reads a Mercado Envios label with the sender after the recipient", () => {
    const label = [
      "Envio: 44123456789",
      "Venda: 2000004567891234",
      "DESTINATÁRIO",
      "Maria da Silva (MARIASILVA123)",
      "Rua das Flores, 123, Apto 45",
      "Referência: portão azul",
      "Jardim Paulista",
      "CEP: 01310-100 - São Paulo/SP",
      "REMETENTE",
      "Ana Moda",
      "Rua do Comércio, 9",
      "CEP: 74000-000 - Goiânia/GO",
    ].join("\n");
    expect(parseShippingLabel(label)).toEqual({
      recipient: "Maria da Silva",
      street: "Rua das Flores",
      number: "123",
      complement: "Apto 45",
      neighborhood: "Jardim Paulista",
      city: "São Paulo",
      state: "SP",
      postalCode: "01310-100",
    });
  });

  it("reads labelled fields, several on one line", () => {
    const label = [
      "Destinatário: João Pereira",
      "Endereço: Avenida Brasil 1500",
      "Complemento: Bloco B",
      "Bairro: Centro Cidade: Belo Horizonte UF: MG",
      "CEP: 30140071",
    ].join("\n");
    expect(parseShippingLabel(label)).toEqual({
      recipient: "João Pereira",
      street: "Avenida Brasil",
      number: "1500",
      complement: "Bloco B",
      neighborhood: "Centro",
      city: "Belo Horizonte",
      state: "MG",
      postalCode: "30140-071",
    });
  });

  it("keeps a number that is part of the street name", () => {
    const label = [
      "Destinatário",
      "Carlos Souza",
      "Rua 7 de Setembro 250 casa 2",
      "Vila Nova",
      "88010-000 Florianópolis - SC",
    ].join("\n");
    expect(parseShippingLabel(label)).toMatchObject({
      street: "Rua 7 de Setembro",
      number: "250",
      complement: "casa 2",
      neighborhood: "Vila Nova",
      city: "Florianópolis",
      state: "SC",
    });
  });

  it("reads a neighborhood printed before the city and a state written in full", () => {
    const label = [
      "Para: Beatriz Lima",
      "Travessa Alegre, s/n",
      "CEP 13010-050 Cambuí - Campinas, São Paulo",
    ].join("\n");
    expect(parseShippingLabel(label)).toEqual({
      recipient: "Beatriz Lima",
      street: "Travessa Alegre",
      number: "s/n",
      neighborhood: "Cambuí",
      city: "Campinas",
      state: "SP",
      postalCode: "13010-050",
    });
  });

  it("reads the city from its own line when the postal code stands alone", () => {
    const label = [
      "DESTINATÁRIO",
      "Pedro Alves",
      "Av. Paulista, 1000",
      "Bela Vista",
      "São Paulo/SP",
      "CEP 01310100",
    ].join("\n");
    expect(parseShippingLabel(label)).toMatchObject({
      neighborhood: "Bela Vista",
      city: "São Paulo",
      state: "SP",
      postalCode: "01310-100",
    });
  });

  it("does not take a phone or an invoice number for the postal code", () => {
    const label = ["Destinatário", "Ana", "Tel: (11) 98765-4321", "NF: 00012345", "Rua A, 1"].join(
      "\n",
    );
    expect(parseShippingLabel(label).postalCode).toBeUndefined();
  });

  it("returns nothing for text that is not a label", () => {
    expect(parseShippingLabel("Nota fiscal eletrônica\nValor total R$ 120,00")).toEqual({});
  });
});
