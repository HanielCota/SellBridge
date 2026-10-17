import { describe, expect, it } from "vitest";
import { checkProductImageBytes } from "./product-image-check";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A PNG header declaring `width` × `height`, without any pixels. */
function pngHeader(width: number, height: number): Uint8Array {
  const header = new Uint8Array(33);
  header.set([...PNG_SIGNATURE, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(header.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return header;
}

describe("checkProductImageBytes", () => {
  it("accepts a PNG of a normal size", () => {
    expect(checkProductImageBytes(pngHeader(1200, 1200))).toBe("image/png");
  });

  it("says a file with only the PNG signature is not a valid image", () => {
    expect(() => checkProductImageBytes(new Uint8Array(PNG_SIGNATURE))).toThrow(
      "O arquivo não é uma imagem PNG válida: ele está corrompido ou incompleto. Envie outra foto.",
    );
  });

  it("says an image declaring no pixels is not a valid image", () => {
    expect(() => checkProductImageBytes(pngHeader(0, 600))).toThrow(/não é uma imagem PNG válida/);
  });

  it("refuses a photo above 64 megapixels with its size", () => {
    expect(() => checkProductImageBytes(pngHeader(10_000, 10_000))).toThrow(
      "A imagem é grande demais (10.000 × 10.000 px): envie uma de até 64 megapixels e 16.384 px por lado",
    );
  });

  it("refuses a file that is not a PNG, JPG or WEBP", () => {
    expect(() => checkProductImageBytes(new TextEncoder().encode("%PDF-1.7"))).toThrow(
      "Envie uma imagem PNG, JPG ou WEBP",
    );
  });
});
