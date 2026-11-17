import { describe, expect, it } from "vitest";
import { labelFileName } from "./label-file-name";

describe("labelFileName", () => {
  // Regression: the PDF label downloaded as "etiqueta-c8b525a9-4629-….pdf", an internal id the
  // supplier never sees, while the ZPL one carried the order number.
  it("names the PDF label by the order number", () => {
    expect(labelFileName("pdf", "770042411183")).toBe("etiqueta-pedido-770042411183.pdf");
  });

  it("names the Zebra label like Mercado Livre's own", () => {
    expect(labelFileName("zpl", "770042411183")).toBe("etiqueta-zebra-pedido-770042411183.txt");
  });

  it("keeps only safe characters of the order number in the file name", () => {
    expect(labelFileName("pdf", 'MLB 77"00/1')).toBe("etiqueta-pedido-MLB77001.pdf");
  });
});
