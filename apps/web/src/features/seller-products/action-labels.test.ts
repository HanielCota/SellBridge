import { describe, expect, it } from "vitest";
import { productAuditFields } from "./action-labels";

describe("product audit field descriptions", () => {
  it("renders stored keys as Portuguese field names without modifying the record", () => {
    const stored = "title,costCents,imageUrls,stock";
    expect(productAuditFields(stored)).toBe(
      "Nome do produto, Custo por unidade, Imagens, Estoque total",
    );
    expect(stored).toBe("title,costCents,imageUrls,stock");
  });

  it("handles missing, initial and future audit field values", () => {
    expect(productAuditFields(null)).toBe("");
    expect(productAuditFields("created")).toBe("Cadastro inicial");
    expect(productAuditFields("futureInternalField")).toBe("Outro campo");
  });
});
