import { describe, expect, it } from "vitest";
import { InvalidZipError, isZip, readZipEntries } from "./zip.ts";
import { zipArchive } from "./testing/zip-archive.ts";

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("readZipEntries", () => {
  it("reads stored and deflated files in the archive's order", () => {
    const archive = zipArchive([
      { name: "Etiqueta de envio.txt", content: "^XA^FDum^FS^XZ", deflate: true },
      { name: "outra.txt", content: "^XA^FDdois^FS^XZ", deflate: false },
    ]);

    const entries = readZipEntries(archive, 1024);

    expect(entries.map((entry) => [entry.name, text(entry.data)])).toEqual([
      ["Etiqueta de envio.txt", "^XA^FDum^FS^XZ"],
      ["outra.txt", "^XA^FDdois^FS^XZ"],
    ]);
  });

  it("leaves folders out", () => {
    const archive = zipArchive([
      { name: "etiquetas/", content: "", deflate: false },
      { name: "etiquetas/1.txt", content: "^XA^XZ", deflate: true },
    ]);

    expect(readZipEntries(archive, 1024).map((entry) => entry.name)).toEqual(["etiquetas/1.txt"]);
  });

  it("refuses an archive that unpacks past the size allowed", () => {
    const archive = zipArchive([{ name: "grande.txt", content: "A".repeat(5000), deflate: true }]);

    expect(() => readZipEntries(archive, 1000)).toThrow(InvalidZipError);
  });

  it("refuses bytes that are not a ZIP", () => {
    const bytes = new TextEncoder().encode("^XA^FDtexto^FS^XZ");

    expect(isZip(bytes)).toBe(false);
    expect(() => readZipEntries(bytes, 1024)).toThrow(InvalidZipError);
  });

  it("refuses an entry whose local header lies past the end of the archive", () => {
    const archive = zipArchive([{ name: "a.txt", content: "^XA^XZ", deflate: false }]);
    const data = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
    const centralDirectory = data.getUint32(archive.length - 22 + 16, true);
    data.setUint32(centralDirectory + 42, archive.length + 1000, true);

    expect(() => readZipEntries(archive, 1024)).toThrow(InvalidZipError);
  });

  it("refuses a ZIP cut short", () => {
    const archive = zipArchive([{ name: "a.txt", content: "^XA".repeat(50), deflate: false }]);
    const cut = archive.subarray(0, 40);

    expect(isZip(cut)).toBe(true);
    expect(() => readZipEntries(cut, 1024)).toThrow(InvalidZipError);
  });
});
