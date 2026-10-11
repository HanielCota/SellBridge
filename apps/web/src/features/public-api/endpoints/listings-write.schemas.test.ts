import { describe, expect, it } from "vitest";
import {
  assertHasChanges,
  createListingBodySchema,
  updateListingBodySchema,
} from "./listings-write.schemas";

const productId = "11111111-1111-4111-8111-111111111111";
const storeId = "22222222-2222-4222-8222-222222222222";

describe("createListingBodySchema", () => {
  it("accepts the minimal body: product and stores only", () => {
    const parsed = createListingBodySchema.parse({ productId, storeIds: [storeId] });
    expect(parsed).toEqual({ productId, storeIds: [storeId] });
  });

  it("trims and accepts a full body", () => {
    const parsed = createListingBodySchema.parse({
      productId,
      title: "  Garrafa térmica 1 litro  ",
      description: "Mantém a bebida quente por 12 horas.",
      priceCents: 8990,
      storeIds: [storeId],
    });
    expect(parsed.title).toBe("Garrafa térmica 1 litro");
  });

  it.each([
    ["a title over 60 characters", { title: "x".repeat(61) }],
    ["a title under 10 characters", { title: "Curto" }],
    ["a short description", { description: "Curta" }],
    ["a fractional price", { priceCents: 10.5 }],
    ["a zero price", { priceCents: 0 }],
    ["no stores", { storeIds: [] }],
    ["a store id that is not a uuid", { storeIds: ["loja-1"] }],
    ["a product id that is not a uuid", { productId: "produto" }],
  ])("rejects %s", (_case, override) => {
    const result = createListingBodySchema.safeParse({
      productId,
      storeIds: [storeId],
      ...override,
    });
    expect(result.success).toBe(false);
  });
});

describe("updateListingBodySchema", () => {
  it("accepts price, pause or both", () => {
    expect(updateListingBodySchema.parse({ priceCents: 5000 })).toEqual({ priceCents: 5000 });
    expect(updateListingBodySchema.parse({ paused: true })).toEqual({ paused: true });
    expect(updateListingBodySchema.parse({ priceCents: 5000, paused: false })).toEqual({
      priceCents: 5000,
      paused: false,
    });
  });

  it("rejects wrong types", () => {
    expect(updateListingBodySchema.safeParse({ priceCents: -1 }).success).toBe(false);
    expect(updateListingBodySchema.safeParse({ paused: "sim" }).success).toBe(false);
  });

  it("treats an empty body as nothing to do (422)", () => {
    const empty = updateListingBodySchema.parse({});
    expect(() => assertHasChanges(empty)).toThrow(expect.objectContaining({ code: "VALIDATION" }));
    expect(() => assertHasChanges({ paused: false })).not.toThrow();
  });
});
