import { describe, expect, it } from "vitest";
import { formatFileSize } from "./file-size";

describe("formatFileSize", () => {
  it("writes megabytes with a decimal comma", () => {
    expect(formatFileSize(12.3 * 1024 * 1024)).toBe("12,3 MB");
  });

  it("writes small files in kilobytes, never as zero", () => {
    expect(formatFileSize(850 * 1024)).toBe("850 KB");
    expect(formatFileSize(10)).toBe("0,1 KB");
  });

  it("writes an exact limit without decimals", () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5 MB");
  });
});
