import { describe, expect, it } from "vitest";
import {
  exportDescription,
  fileNameFromDisposition,
  productExportFileName,
  productExportHref,
} from "./product-export-file";

describe("productExportHref", () => {
  it("leaves the default filters out", () => {
    const href = productExportHref({ status: "all", query: undefined, fiscal: "all" });

    expect(href).toBe("/api/fornecedor/exportar/catalogo");
  });

  it("carries the status tab, the search and the fiscal filter", () => {
    const href = productExportHref({ status: "rejected", query: "saia azul", fiscal: "missing" });

    expect(href).toBe(
      "/api/fornecedor/exportar/catalogo?status=rejected&query=saia+azul&fiscal=missing",
    );
  });
});

describe("productExportFileName", () => {
  it("names the brand without accents and the day in Brazil", () => {
    const lateNightInBrazil = new Date("2026-11-15T02:30:00Z");

    const name = productExportFileName("Ateliê Divinópolis Confecções", lateNightInBrazil);

    expect(name).toBe("produtos-atelie-divinopolis-confeccoes-2026-11-14.csv");
  });
});

describe("fileNameFromDisposition", () => {
  it("reads the server's file name", () => {
    const name = fileNameFromDisposition('attachment; filename="produtos-marca-2026-11-14.csv"');

    expect(name).toBe("produtos-marca-2026-11-14.csv");
  });

  it.each([null, "attachment", 'attachment; filename=""'])(
    "falls back to a plain name for %s",
    (header) => {
      expect(fileNameFromDisposition(header)).toBe("produtos.csv");
    },
  );
});

describe("exportDescription", () => {
  it.each([
    [undefined, false, "Seus produtos, prontos para editar e importar de volta"],
    [0, true, "Nenhum produto nesta lista para baixar"],
    [1, false, "Seu produto, pronto para editar e importar de volta"],
    [1, true, "O produto desta busca ou filtro, pronto para editar e importar de volta"],
    [1250, false, "Todos os seus 1.250 produtos, prontos para editar e importar de volta"],
    [12, true, "Os 12 produtos desta busca ou filtro, prontos para editar e importar de volta"],
  ])("says what %s products (filtered: %s) will download", (count, filtered, expected) => {
    expect(exportDescription(count, filtered)).toBe(expected);
  });
});
