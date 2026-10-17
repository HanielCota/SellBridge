import { describe, expect, it } from "vitest";
import { confirmDescription, onlyValidLabel } from "./import-wording";

describe("onlyValidLabel", () => {
  it("uses the singular for one row on either side", () => {
    expect(onlyValidLabel(1, 1)).toBe(
      "Importar só a linha válida. A linha com erro fica de fora até você corrigir e enviar de novo.",
    );
  });

  it("counts several rows", () => {
    expect(onlyValidLabel(1200, 3)).toBe(
      "Importar só as 1.200 linhas válidas. As 3 linhas com erro ficam de fora até você corrigir e enviar de novo.",
    );
  });
});

describe("confirmDescription", () => {
  it("leaves out a count that is zero", () => {
    expect(confirmDescription({ created: 2, updated: 0, failedRows: 0 })).toBe(
      "2 produtos novos serão criados, pelo SKU, com estoque e custo da planilha.",
    );
  });

  it("names new, updated and left-out rows", () => {
    expect(confirmDescription({ created: 1, updated: 3, failedRows: 1 })).toBe(
      "1 produto novo será criado e 3 produtos existentes serão atualizados, pelo SKU, com estoque e custo da planilha. 1 linha com erro não será importada.",
    );
  });
});
