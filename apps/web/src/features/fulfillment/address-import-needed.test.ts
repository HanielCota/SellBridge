import { describe, expect, it } from "vitest";
import { addressImportNeeded } from "./address-import-needed";

const completeAddress = {
  recipient: "Ana Souza",
  street: "Rua das Palmeiras",
  number: "120",
  complement: "",
  neighborhood: "Jardim América",
  city: "Campinas",
  state: "SP",
  postalCode: "13010-000",
};

describe("addressImportNeeded", () => {
  it("offers the import when the order came without an address", () => {
    expect(addressImportNeeded(null)).toBe(true);
  });

  it("keeps offering the import when the marketplace address is incomplete", () => {
    expect(addressImportNeeded({ ...completeAddress, neighborhood: "" })).toBe(true);
  });

  it("hides the import when the marketplace address is complete", () => {
    expect(addressImportNeeded(completeAddress)).toBe(false);
  });
});
