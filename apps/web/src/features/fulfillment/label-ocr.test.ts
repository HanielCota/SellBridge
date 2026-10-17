import { describe, expect, it, vi } from "vitest";
import { OCR_IMAGE_SIDE, scaledSize, terminateWhenStarted } from "./label-ocr";

describe("terminateWhenStarted", () => {
  it("shuts down a reader that finishes starting after the wait gave up", async () => {
    const terminate = vi.fn<() => Promise<undefined>>(async () => undefined);
    await terminateWhenStarted(Promise.resolve({ terminate }));
    expect(terminate).toHaveBeenCalledOnce();
  });

  it("settles quietly when the late start fails, since no reader is left running", async () => {
    await expect(terminateWhenStarted(Promise.reject(new Error("model")))).resolves.toBe(undefined);
  });
});

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
