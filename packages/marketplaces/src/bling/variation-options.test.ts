import { describe, expect, it } from "vitest";
import { blingModelCode, readVariationOptions, colorInBlingName } from "./variation-options.ts";

describe("readVariationOptions", () => {
  it.each([
    ["Cor:Preto;Tamanho:38", { color: "Preto", size: "38" }],
    ["Tamanho:G;Cor:Verde", { color: "Verde", size: "G" }],
    [" cor : Azul Marinho ; TAMANHO : 33/34 ;", { color: "Azul Marinho", size: "33/34" }],
    ["Numeração:41", { color: null, size: "41" }],
    ["Cor:Bege", { color: "Bege", size: null }],
  ])("reads %s as a colour and size", (name, expected) => {
    expect(readVariationOptions(name)).toEqual(expected);
  });

  it.each([
    ["Voltagem:110V"],
    ["Cor:Preto;Voltagem:220V"],
    ["Cor:Preto;Cor:Branco"],
    ["Tamanho:38;Numeração:38"],
    ["Cor:"],
    ["Preto 38"],
    [""],
    [`Cor:${"x".repeat(41)}`],
  ])("refuses %s, which a grid cannot hold", (name) => {
    expect(readVariationOptions(name)).toBeNull();
  });
});

describe("blingModelCode", () => {
  it("uses the parent's own Bling code", () => {
    expect(blingModelCode({ id: 7, codigo: " TEN-CASUAL " })).toBe("TEN-CASUAL");
  });

  it("makes one from the Bling id when the parent has no code or one too long", () => {
    expect(blingModelCode({ id: 7, codigo: "" })).toBe("BLING-7");
    expect(blingModelCode({ id: 8, codigo: null })).toBe("BLING-8");
    expect(blingModelCode({ id: 9, codigo: "X".repeat(61) })).toBe("BLING-9");
  });
});

describe("colorInBlingName", () => {
  it("reads the colour from the full Bling name of a variation", () => {
    const color = colorInBlingName("BABUCHE NUVEM Cor:MARINHO;Tamanho:33/34");

    expect(color).toBe("MARINHO");
  });

  it("reads the colour when it comes after the size", () => {
    const color = colorInBlingName("Chinelo Tamanho:38; cor: Preto fosco");

    expect(color).toBe("Preto fosco");
  });

  it("finds no colour in a name without one", () => {
    const color = colorInBlingName("Tênis Corrida Tamanho:40");

    expect(color).toBeNull();
  });

  it("finds no colour when another option runs into it without a semicolon", () => {
    const color = colorInBlingName("Chinelo Cor:Preto Tamanho:38");

    expect(color).toBeNull();
  });

  it("finds no colour when the name leaves it empty", () => {
    const color = colorInBlingName("Babuche Cor: ;Tamanho:35");

    expect(color).toBeNull();
  });
});
