import { CONTACT_DETAILS_REFUSED } from "@sellbridge/shared/schemas";
import { describe, expect, it } from "vitest";
import { contactWarning } from "./contact-warning";

describe("contactWarning", () => {
  it("warns while a phone, e-mail or social user is typed", () => {
    expect(contactWarning("Me chama no 11 98765-4321")).toBe(CONTACT_DETAILS_REFUSED);
    expect(contactWarning("fulano arroba gmail ponto com")).toBe(CONTACT_DETAILS_REFUSED);
    expect(contactWarning("insta: fulano.loja")).toBe(CONTACT_DETAILS_REFUSED);
  });

  it("stays quiet for ordinary instructions", () => {
    expect(contactWarning("")).toBeNull();
    expect(contactWarning("Embalar com plástico bolha, pedido MLB1234567890")).toBeNull();
  });
});
