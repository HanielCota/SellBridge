import { describe, expect, it } from "vitest";
import {
  detectAttachmentType,
  hasAcceptableImageSize,
  imageSize,
  sanitizeFileName,
} from "./file-signature.ts";

const bytes = (...values: number[]) => new Uint8Array(values);

describe("detectAttachmentType", () => {
  it("recognizes allowed signatures", () => {
    expect(detectAttachmentType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe(
      "image/png",
    );
    expect(detectAttachmentType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(
      detectAttachmentType(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50)),
    ).toBe("image/webp");
    expect(detectAttachmentType(new TextEncoder().encode("%PDF-1.7"))).toBe("application/pdf");
  });

  it("rejects executables, text and empty files", () => {
    expect(detectAttachmentType(bytes(0x4d, 0x5a, 0x90, 0x00))).toBeNull();
    expect(detectAttachmentType(new TextEncoder().encode("<script>"))).toBeNull();
    expect(detectAttachmentType(bytes())).toBeNull();
  });
});

describe("sanitizeFileName", () => {
  it("removes paths, accents and unsafe characters", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("C:\\Users\\Comprovante de devolução (1).pdf")).toBe(
      "Comprovante-de-devolucao-1-.pdf",
    );
    expect(sanitizeFileName(".htaccess")).toBe("htaccess");
  });

  it("never returns an empty name", () => {
    expect(sanitizeFileName("///")).toBe("arquivo");
    expect(sanitizeFileName("")).toBe("arquivo");
  });
});

/** A PNG header declaring `width` × `height`, without any pixels. */
function pngHeader(width: number, height: number): Uint8Array {
  const header = new Uint8Array(33);
  header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(header.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return header;
}

/** A JPEG with an APP0 segment and padding before the frame that carries the size. */
function jpegHeader(width: number, height: number): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, ...Array.from({ length: 14 }, () => 0)];
  const frame = [
    0xff,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
  ];
  return new Uint8Array([0xff, 0xd8, ...app0, ...frame, ...Array.from({ length: 8 }, () => 0)]);
}

/** A 24-bit little-endian size minus one, as VP8X stores it. */
function vp8xSize(value: number): number[] {
  return [(value - 1) & 0xff, ((value - 1) >> 8) & 0xff, ((value - 1) >> 16) & 0xff];
}

/** An extended (VP8X) WebP header declaring its canvas size. */
function webpHeader(width: number, height: number): Uint8Array {
  const header = new Uint8Array(30);
  header.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58]);
  header.set(vp8xSize(width), 24);
  header.set(vp8xSize(height), 27);
  return header;
}

describe("imageSize", () => {
  it("reads the declared size of PNG, JPEG and WebP headers", () => {
    expect(imageSize(pngHeader(800, 600), "image/png")).toEqual({ width: 800, height: 600 });
    expect(imageSize(jpegHeader(4000, 3000), "image/jpeg")).toEqual({ width: 4000, height: 3000 });
    expect(imageSize(webpHeader(1024, 768), "image/webp")).toEqual({ width: 1024, height: 768 });
  });

  it("cannot read a header cut short", () => {
    expect(imageSize(pngHeader(800, 600).slice(0, 20), "image/png")).toBeNull();
    expect(imageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg")).toBeNull();
  });
});

describe("hasAcceptableImageSize", () => {
  it("accepts up to 64 megapixels and 16.384 px per side", () => {
    expect(hasAcceptableImageSize(pngHeader(8000, 8000), "image/png")).toBe(true);
    expect(hasAcceptableImageSize(pngHeader(16_384, 3906), "image/png")).toBe(true);
  });

  it.each([
    ["a decompression bomb", 30_000, 30_000],
    ["one pixel past the area", 8000, 8001],
    ["one pixel past a side", 16_385, 10],
    ["an empty image", 0, 100],
  ])("refuses %s", (_label, width, height) => {
    expect(hasAcceptableImageSize(pngHeader(width, height), "image/png")).toBe(false);
  });

  it("refuses an image whose size cannot be read", () => {
    expect(hasAcceptableImageSize(new Uint8Array([0xff, 0xd8, 0xff]), "image/jpeg")).toBe(false);
  });
});
