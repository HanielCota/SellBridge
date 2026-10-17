import { describe, expect, it } from "vitest";
import { confirmDescription, onlyValidLabel } from "./import-wording";

describe("onlyValidLabel", () => {
  it("uses the singular for one row on either side", () => {
    expect(onlyValidLabel(1, 1)).toBe("Importar só a linha válida, sem a linha com erro");
  });

  it("counts several rows", () => {
    expect(onlyValidLabel(1200, 3)).toBe("Importar só as 1.200 linhas válidas, sem as 3 com erro");
  });
});

describe("confirmDescription", () => {
  it("leaves out a count that is zero", () => {
    expect(confirmDescription({ created: 2, updated: 0, failedRows: 0 })).toBe("2 produtos novos.");
  });

  it("names new, updated and left-out rows", () => {
    expect(confirmDescription({ created: 1, updated: 3, failedRows: 1 })).toBe(
      "1 produto novo e 3 atualizados pelo SKU; 1 linha com erro fica de fora.",
    );
  });
});
