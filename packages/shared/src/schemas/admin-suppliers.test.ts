import { describe, expect, it } from "vitest";
import { catalogDraftValuesSchema } from "../domain/supplier-panel-catalog-schemas.ts";
import {
  adminSaveProductSchema,
  adminSupplierValuesSchema,
  MAX_PRODUCT_STOCK,
  SUPPLIER_SLA_DEFAULTS,
} from "./admin-suppliers.ts";

const values = {
  name: "Fornecedor",
  niche: "Moda",
  description: "",
  state: "SP",
  city: "São Paulo",
  logoUrl: null,
  contactEmail: "pedidos@fornecedor.com.br",
  acceptWithinHours: 24,
  dispatchWithinHours: 48,
};

describe("supplier contact and deadlines", () => {
  it("keeps the e-mail for orders and the deadlines in hours", () => {
    expect(adminSupplierValuesSchema.parse(values)).toMatchObject({
      contactEmail: "pedidos@fornecedor.com.br",
      acceptWithinHours: 24,
      dispatchWithinHours: 48,
    });
  });

  it("lets the e-mail stay empty and lowercases it", () => {
    expect(adminSupplierValuesSchema.parse({ ...values, contactEmail: null }).contactEmail).toBe(
      null,
    );
    expect(
      adminSupplierValuesSchema.parse({ ...values, contactEmail: " Pedidos@Fornecedor.COM.br " })
        .contactEmail,
    ).toBe("pedidos@fornecedor.com.br");
  });

  it("rejects an invalid e-mail with a message in Portuguese", () => {
    const result = adminSupplierValuesSchema.safeParse({ ...values, contactEmail: "pedidos@" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Informe um e-mail válido");
  });

  it.each([0, -1, 1.5, 721])("rejects a deadline of %s hours", (hours) => {
    expect(
      adminSupplierValuesSchema.safeParse({ ...values, acceptWithinHours: hours }).success,
    ).toBe(false);
    expect(
      adminSupplierValuesSchema.safeParse({ ...values, dispatchWithinHours: hours }).success,
    ).toBe(false);
  });

  it("does not let the supplier have longer to accept than to dispatch", () => {
    const result = adminSupplierValuesSchema.safeParse({
      ...values,
      acceptWithinHours: 72,
      dispatchWithinHours: 48,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["acceptWithinHours"]);
  });

  it("starts new suppliers at one day to accept and two to dispatch", () => {
    expect(SUPPLIER_SLA_DEFAULTS).toEqual({ acceptWithinHours: 24, dispatchWithinHours: 48 });
  });
});

const product = {
  supplierId: "6f1d3a4e-6a43-4f4e-9d5c-2f0b8c1a7e10",
  productId: "9b2c7d1e-3f4a-4b5c-8d6e-7f8091a2b3c4",
  sku: "SKU-1",
  title: "Camiseta",
  description: "",
  costCents: 1000,
  suggestedPriceCents: 2000,
  stock: 10,
  categoryId: null,
  imageUrls: [],
};

describe("product stock bounds", () => {
  it.each([0, 1, MAX_PRODUCT_STOCK])("accepts a shelf count of %s", (stock) => {
    expect(adminSaveProductSchema.safeParse({ ...product, stock }).success).toBe(true);
  });

  it.each([-1, 1.5, MAX_PRODUCT_STOCK + 1, 2_147_483_647])(
    "rejects a shelf count of %s",
    (stock) => {
      expect(adminSaveProductSchema.safeParse({ ...product, stock }).success).toBe(false);
    },
  );

  // Regression: shipped units can leave the shelf below zero, and the form sends that count back
  // as `expectedStock`; with `min(0)` the product could no longer be saved, without any message.
  it("keeps a product whose shelf went negative editable", () => {
    expect(adminSaveProductSchema.safeParse({ ...product, expectedStock: -3 }).success).toBe(true);
  });

  it("saves an edit that leaves a negative shelf untouched", () => {
    expect(
      adminSaveProductSchema.safeParse({ ...product, stock: -3, expectedStock: -3 }).success,
    ).toBe(true);
  });

  it("rejects a new product with a fabricated negative opening count", () => {
    expect(
      adminSaveProductSchema.safeParse({
        ...product,
        productId: undefined,
        stock: -3,
        expectedStock: -3,
      }).success,
    ).toBe(false);
  });

  it("refuses typing a negative shelf over the opened count", () => {
    const parsed = adminSaveProductSchema.safeParse({ ...product, stock: -1, expectedStock: 5 });
    expect(parsed.error?.issues[0]?.message).toBe("O estoque não pode ser negativo");
  });

  it("rejects an opened shelf count outside int4", () => {
    expect(
      adminSaveProductSchema.safeParse({ ...product, expectedStock: -2_147_483_649 }).success,
    ).toBe(false);
  });
});

function draftMessageOf(change: Record<string, unknown>): string | undefined {
  return catalogDraftValuesSchema.safeParse({ ...product, ...change }).error?.issues[0]?.message;
}

describe("product money messages", () => {
  it("says in Portuguese that the cost cannot be negative, with the value received", () => {
    expect(draftMessageOf({ costCents: -500 })).toMatch(
      /^O custo não pode ser negativo: recebido -R\$\s5,00, informe R\$ 0,00 ou mais$/,
    );
  });

  it("names the suggested price and the amount when it is above the listing limit", () => {
    expect(draftMessageOf({ suggestedPriceCents: 100_000_001 })).toMatch(
      /^O preço sugerido pode ser de até R\$ 1\.000\.000,00 \(recebido: R\$\s1\.000\.000,01\)$/,
    );
  });

  it("explains a cost that is not a number", () => {
    expect(draftMessageOf({ costCents: Number.NaN })).toBe(
      "O custo precisa ser um valor em reais, como 25,90 (recebido: um valor que não é número)",
    );
  });
});
