import { describe, expect, it } from "vitest";
import {
  productImagePathSchema,
  productImageStorageKey,
  productImageUrl,
} from "./product-image-key";

const SUPPLIER = "b74a569f-757c-4b0a-92db-9ffc2a2506ae";
const FILE = "0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0.jpg";

describe("productImageUrl", () => {
  it("builds an absolute link a marketplace can fetch, under the app's own address", () => {
    expect(productImageUrl("https://app.sellbridge.com.br/", SUPPLIER, FILE)).toBe(
      `https://app.sellbridge.com.br/api/produtos/imagens/${SUPPLIER}/${FILE}`,
    );
  });
});

describe("productImagePathSchema", () => {
  it("accepts only a supplier id and a generated image name", () => {
    expect(productImagePathSchema.safeParse({ supplierId: SUPPLIER, fileName: FILE }).success).toBe(
      true,
    );
    expect(
      productImagePathSchema.safeParse({ supplierId: SUPPLIER, fileName: "../../.env" }).success,
    ).toBe(false);
    expect(productImagePathSchema.safeParse({ supplierId: "..", fileName: FILE }).success).toBe(
      false,
    );
  });

  it("keeps every supplier's images in its own folder", () => {
    expect(productImageStorageKey({ supplierId: SUPPLIER, fileName: FILE })).toBe(
      `product-images/${SUPPLIER}/${FILE}`,
    );
  });
});
