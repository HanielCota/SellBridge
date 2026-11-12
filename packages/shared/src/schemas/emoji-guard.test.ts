import { describe, expect, it } from "vitest";
import { catalogDraftValuesSchema } from "../domain/supplier-panel-catalog-schemas.ts";
import { adminProductValuesSchema } from "./admin-suppliers.ts";
import { listingDescriptionSchema } from "./stores.ts";

const REFUSAL =
  "A descrição tem emojis (🔥 ✅), e o Mercado Livre não aceita. Tire os emojis para salvar.";

describe("descriptions without emojis", () => {
  it("refuses a product description with emojis, naming them", () => {
    const parsed = adminProductValuesSchema.shape.description.safeParse("Camiseta 🔥 algodão ✅");

    expect(parsed.error?.issues.map((issue) => issue.message)).toEqual([REFUSAL]);
  });

  it("refuses emojis in the supplier panel's product description too", () => {
    const parsed = catalogDraftValuesSchema.shape.description.safeParse("Camiseta 🔥 algodão ✅");

    expect(parsed.success).toBe(false);
  });

  it("refuses a listing description with emojis", () => {
    const parsed = listingDescriptionSchema.safeParse("Camiseta de algodão macia 🔥 ✅");

    expect(parsed.error?.issues.map((issue) => issue.message)).toEqual([REFUSAL]);
  });

  it("keeps accents, hashtags and brand signs", () => {
    const text = "Camiseta de algodão, ótima à noite! #verão Marca® Algodão™";

    expect(adminProductValuesSchema.shape.description.parse(text)).toBe(text);
    expect(listingDescriptionSchema.parse(text)).toBe(text);
  });
});
