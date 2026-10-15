import { describe, expect, it } from "vitest";
import { adminSupplierValuesSchema, SUPPLIER_SLA_DEFAULTS } from "./admin-suppliers.ts";

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
