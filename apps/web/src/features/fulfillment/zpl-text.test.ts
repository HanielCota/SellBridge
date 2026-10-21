import { describe, expect, it } from "vitest";
import { isZpl, zplToText } from "./zpl-text";

describe("zplToText", () => {
  it("prints one line per text field and skips barcodes", () => {
    const zpl = [
      "^XA",
      "^FO20,20^BCN,80,Y,N,N^FD44123456789^FS",
      "^FO20,120^A0N,28,28^FDDESTINATARIO^FS",
      "^FO20,160^A0N,28,28^FDMaria da Silva^FS",
      "^XZ",
    ].join("\n");
    expect(zplToText(zpl)).toBe("DESTINATARIO\nMaria da Silva");
  });

  it("decodes hex-escaped UTF-8 accents", () => {
    const zpl = "^XA^FO20,20^FH^FDS_C3_A3o Paulo/SP^FS^XZ";
    expect(zplToText(zpl)).toBe("São Paulo/SP");
  });

  it("decodes escapes with a custom indicator and block line breaks", () => {
    const zpl = "^XA^FO20,20^FB400,3^FH\\^FDRua das Flores\\&Goi\\C3\\A2nia/GO^FS^XZ";
    expect(zplToText(zpl)).toBe("Rua das Flores\nGoiânia/GO");
  });
});

describe("isZpl", () => {
  it("tells ZPL from plain text", () => {
    expect(isZpl("^XA^FDtexto^FS^XZ")).toBe(true);
    expect(isZpl("Destinatário: Maria")).toBe(false);
  });
});
