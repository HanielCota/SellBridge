import { forwardOrderSchema } from "@sellbridge/shared/schemas";
import { describe, expect, it } from "vitest";
import { clearForwardErrors, firstForwardErrorField, forwardErrorsByField } from "./forward-errors";

const ORDER_ID = "6f1c2a4e-8a1b-4c3d-9e2f-1a2b3c4d5e6f";

function errorsFor(address: Record<string, string>, notes = "") {
  const parsed = forwardOrderSchema.safeParse({ orderId: ORDER_ID, address, notes });
  if (parsed.success) {
    return {};
  }
  return forwardErrorsByField(parsed.error.issues);
}

const COMPLETE_ADDRESS = {
  recipient: "Ana Souza",
  street: "Rua das Palmeiras",
  number: "120",
  complement: "",
  neighborhood: "Jardim América",
  city: "Campinas",
  state: "SP",
  postalCode: "13010-000",
};

describe("forwardErrorsByField", () => {
  it("names every field with a problem, not only the first", () => {
    const errors = errorsFor({ ...COMPLETE_ADDRESS, street: "", neighborhood: "" });

    expect(errors).toEqual({ street: "Informe a rua", neighborhood: "Informe o bairro" });
  });

  it("says how to type the CEP", () => {
    const errors = errorsFor({ ...COMPLETE_ADDRESS, postalCode: "1301" });

    expect(errors.postalCode).toBe("Informe os 8 números do CEP, como 01310-100");
  });

  it("returns no errors for a complete address", () => {
    expect(errorsFor(COMPLETE_ADDRESS)).toEqual({});
  });
});

describe("firstForwardErrorField", () => {
  it("picks the first problem in the order the form shows the fields", () => {
    const first = firstForwardErrorField({ city: "Informe a cidade", postalCode: "CEP" });

    expect(first).toBe("postalCode");
  });

  it("returns null when nothing is wrong", () => {
    expect(firstForwardErrorField({})).toBeNull();
  });
});

describe("clearForwardErrors", () => {
  it("drops only the messages of the changed fields", () => {
    const errors = { street: "Informe a rua", city: "Informe a cidade", notes: "Sem telefone" };

    const cleared = clearForwardErrors(errors, ["street", "city"]);

    expect(cleared).toEqual({ notes: "Sem telefone" });
  });
});
