import { describe, expect, it } from "vitest";
import { detectAttachmentType, sanitizeFileName } from "./file-signature.ts";

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
