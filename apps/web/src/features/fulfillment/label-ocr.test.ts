import { describe, expect, it } from "vitest";
import { OCR_IMAGE_SIDE, scaledSize } from "./label-ocr";

describe("scaledSize", () => {
  it("shrinks a large phone photo to the OCR size, keeping its proportions", () => {
    expect(scaledSize(4000, 3000)).toEqual({ width: OCR_IMAGE_SIDE, height: 1800 });
  });

  it("enlarges a small screenshot at most twice", () => {
    expect(scaledSize(400, 600)).toEqual({ width: 800, height: 1200 });
  });

  it("returns an empty size for an empty image", () => {
    expect(scaledSize(0, 0)).toEqual({ width: 0, height: 0 });
  });
});
