import { describe, expect, it } from "vitest";
import { attachmentType, rejectionSummary, selectAttachments } from "./attachment-selection";

const MEGABYTE = 1024 * 1024;

function fakeFile(name: string, type: string, size = 1000, lastModified = 1): File {
  const file = new File(["x"], name, { type, lastModified });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("selectAttachments", () => {
  it("keeps the good files when one file of the batch is too big", () => {
    const print = fakeFile("print.png", "image/png");
    const statement = fakeFile("extrato.pdf", "application/pdf");
    const photo = fakeFile("foto.jpg", "image/jpeg", 9 * MEGABYTE);
    const selection = selectAttachments([], [print, photo, statement]);
    expect(selection.accepted).toEqual([print, statement]);
    expect(selection.rejected).toEqual([
      { name: "foto.jpg", reason: "Esse arquivo é grande demais. Envie um print em vez da foto." },
    ]);
  });

  it("explains how to send an iPhone photo instead of calling it an unknown format", () => {
    const selection = selectAttachments([], [fakeFile("IMG_4821.HEIC", "")]);
    expect(selection.rejected.at(0)?.reason).toContain("Tire um print dela");
  });

  it("refuses the same file picked twice", () => {
    const print = fakeFile("print.png", "image/png");
    const again = fakeFile("print.png", "image/png");
    const selection = selectAttachments([print], [again]);
    expect(selection.accepted).toEqual([]);
    expect(selection.rejected.at(0)?.reason).toBe("Esse arquivo já está na lista.");
  });

  it("fills the free slots and refuses only the files beyond the limit", () => {
    const current = [fakeFile("a.png", "image/png", 10, 1), fakeFile("b.png", "image/png", 10, 2)];
    const added = [fakeFile("c.png", "image/png", 10, 3), fakeFile("d.png", "image/png", 10, 4)];
    const selection = selectAttachments(current, added);
    expect(selection.accepted.map((file) => file.name)).toEqual(["c.png"]);
    expect(selection.rejected.map((item) => item.name)).toEqual(["d.png"]);
  });

  it("accepts a known extension when the system leaves the type empty", () => {
    const file = fakeFile("print.webp", "");
    expect(attachmentType(file)).toBe("image/webp");
    expect(selectAttachments([], [file]).accepted).toEqual([file]);
  });
});

describe("rejectionSummary", () => {
  it("joins every refusal with the file it is about", () => {
    expect(rejectionSummary([])).toBeNull();
    expect(rejectionSummary([{ name: "x.exe", reason: "Não aceito." }])).toBe("x.exe: Não aceito.");
  });
});
