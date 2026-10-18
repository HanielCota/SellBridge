import { describe, expect, it } from "vitest";
import { readLabelAddress } from "./label-file";

describe("readLabelAddress", () => {
  it("names an oversized label in Brazilian wording", async () => {
    const tooBig = new File([new Uint8Array(12.3 * 1024 * 1024)], "etiqueta.pdf", {
      type: "application/pdf",
    });
    await expect(readLabelAddress(tooBig)).rejects.toThrow(
      "A etiqueta tem 12,3 MB; o limite é 10 MB.",
    );
  });
});
