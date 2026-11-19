import { describe, expect, it } from "vitest";
import { imageSourceLabel } from "./image-source";

describe("imageSourceLabel", () => {
  // Regression: each photo showed its whole address, such as
  // http://localhost:3650/api/produtos/imagens/6eb5…/9f91….jpg, under its name.
  it("names an uploaded photo by how it was sent, not by its address", () => {
    const label = imageSourceLabel(
      "http://localhost:3650/api/produtos/imagens/6eb54127-16ac-4b8c-9803-5480fe14d657/9f915ace.jpg",
    );

    expect(label).toBe("Enviada do celular ou computador");
  });

  it("names a pasted link by its site", () => {
    expect(imageSourceLabel("https://www.exemplo.com.br/fotos/serum-1.jpg")).toBe(
      "Link de exemplo.com.br",
    );
  });

  it("falls back to a plain name when the address cannot be read", () => {
    expect(imageSourceLabel("not a url")).toBe("Foto do produto");
  });
});
