import { describe, expect, it } from "vitest";
import { matchesCommand } from "./command-matching";

describe("Portuguese navigation search", () => {
  it("finds accented labels with unaccented queries", () => {
    expect(matchesCommand({ label: "Publicações", keywords: "anúncios" }, "publicacoes")).toBe(
      true,
    );
    expect(matchesCommand({ label: "Visão geral", keywords: "painel" }, "VISAO geral")).toBe(true);
  });

  it("matches task keywords and requires every search word", () => {
    const command = { label: "Meus produtos", keywords: "cadastrar próprios estoque" };
    expect(matchesCommand(command, "CADASTRAR proprios")).toBe(true);
    expect(matchesCommand(command, "produtos pedidos")).toBe(false);
    expect(matchesCommand(command, " ")).toBe(true);
  });
});
