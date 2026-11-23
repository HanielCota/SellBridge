import { describe, expect, it } from "vitest";
import {
  confirmDescription,
  importActionLabel,
  importDoneSummary,
  importNeedsConfirmation,
  onlyValidLabel,
} from "./import-wording";

describe("importActionLabel", () => {
  it("says how many products are new and how many only update", () => {
    expect(importActionLabel({ created: 3, updated: 2 })).toBe("Importar 3 novos e atualizar 2");
  });

  it("uses the singular for one new product among updates", () => {
    expect(importActionLabel({ created: 1, updated: 1 })).toBe("Importar 1 novo e atualizar 1");
  });

  it("names only the new products when none updates", () => {
    expect(importActionLabel({ created: 1, updated: 0 })).toBe("Importar 1 produto novo");
    expect(importActionLabel({ created: 1200, updated: 0 })).toBe("Importar 1.200 produtos novos");
  });

  it("says update when every product already exists", () => {
    expect(importActionLabel({ created: 0, updated: 2 })).toBe("Atualizar 2 produtos");
  });

  it("falls back to a plain label with nothing to import", () => {
    expect(importActionLabel({ created: 0, updated: 0 })).toBe("Importar");
  });
});

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
      "1 produto novo e 3 atualizados pelo código; 1 linha com erro fica de fora.",
    );
  });
});

describe("importDoneSummary", () => {
  const base = { created: 0, updated: 0, pausedTargets: 0, synchronizationQueued: true };

  it("agrees every count with its noun in the singular", () => {
    expect(importDoneSummary({ ...base, created: 1, pausedTargets: 1 }, 1)).toBe(
      "1 produto novo. Os novos completos já aparecem para os revendedores; os com pendência ficam como rascunho. Estoque enviado aos marketplaces. 1 anúncio pausado sem estoque. 1 linha com erro ficou de fora; corrija e envie de novo.",
    );
  });

  it("uses the plural and leaves out what is zero", () => {
    expect(importDoneSummary({ ...base, created: 2, updated: 3 }, 0)).toBe(
      "2 produtos novos e 3 atualizados. Os novos completos já aparecem para os revendedores; os com pendência ficam como rascunho. Estoque enviado aos marketplaces.",
    );
    expect(
      importDoneSummary({ ...base, updated: 1, synchronizationQueued: false, pausedTargets: 2 }, 4),
    ).toBe(
      "1 atualizado. O estoque chega aos anúncios na próxima atualização automática. 2 anúncios pausados sem estoque. 4 linhas com erro ficaram de fora; corrija e envie de novo.",
    );
  });
});

describe("importNeedsConfirmation", () => {
  // Regression: two new products asked "Importar 2 produtos novos?" with nothing more to say,
  // an extra click for an import that changes nothing already there.
  it("imports only new products without asking", () => {
    expect(importNeedsConfirmation({ updated: 0, failedRows: 0 })).toBe(false);
  });

  it("asks first when the import changes existing products or leaves rows out", () => {
    expect(importNeedsConfirmation({ updated: 1, failedRows: 0 })).toBe(true);
    expect(importNeedsConfirmation({ updated: 0, failedRows: 2 })).toBe(true);
  });
});
