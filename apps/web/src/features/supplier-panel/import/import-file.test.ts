import { describe, expect, it } from "vitest";
import { assertImportableFile, failedRowsFileName, fileToBase64 } from "./import-file";

describe("assertImportableFile", () => {
  it("accepts csv, txt, tsv and xlsx up to 2 MB", () => {
    for (const name of ["a.csv", "A.TXT", "b.tsv", "c.xlsx"]) {
      expect(() => assertImportableFile({ name, size: 10 })).not.toThrow();
    }
  });

  it("explains how to save an old .xls as .xlsx", () => {
    expect(() => assertImportableFile({ name: "a.xls", size: 10 })).toThrow(/salve como .xlsx/);
  });

  it("refuses empty and oversized files", () => {
    expect(() => assertImportableFile({ name: "a.csv", size: 0 })).toThrow(/vazio/);
    expect(() => assertImportableFile({ name: "a.csv", size: 3 * 1024 * 1024 })).toThrow(/2 MB/);
  });
});

describe("fileToBase64", () => {
  it("encodes every byte, including non-ASCII ones", async () => {
    const bytes = Uint8Array.from([0xe3, 0x00, 0xff, 0x41]);
    expect(await fileToBase64(new Blob([bytes]))).toBe(Buffer.from(bytes).toString("base64"));
  });
});

describe("failedRowsFileName", () => {
  it("names the export after the uploaded file", () => {
    expect(failedRowsFileName("catalogo outubro.xlsx")).toBe("catalogo outubro-com-erro.csv");
    expect(failedRowsFileName(".csv")).toBe("produtos-com-erro.csv");
  });
});
