import { describe, expect, it } from "vitest";
import { readTextWithin } from "./http-body.ts";

/** A body streamed 4 bytes at a time, like a chunked upload. */
function streamed(text: string, headers: Record<string, string> = {}) {
  const bytes = new TextEncoder().encode(text);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let start = 0; start < bytes.length; start += 4) {
        controller.enqueue(bytes.slice(start, start + 4));
      }
      controller.close();
    },
  });
  return new Request("http://localhost/x", { method: "POST", body, headers, duplex: "half" });
}

describe("readTextWithin", () => {
  it("reads a body of exactly the limit", async () => {
    expect(await readTextWithin(streamed("a".repeat(10)), 10)).toBe("a".repeat(10));
  });

  it("stops a chunked body without content-length one byte past the limit", async () => {
    expect(await readTextWithin(streamed("a".repeat(11)), 10)).toBeNull();
  });

  it("counts bytes, not characters: accents take two", async () => {
    expect(await readTextWithin(streamed("ééééé"), 9)).toBeNull();
    expect(await readTextWithin(streamed("ééééé"), 10)).toBe("ééééé");
  });

  it("refuses a declared length above the limit before reading", async () => {
    expect(await readTextWithin(streamed("a", { "content-length": "11" }), 10)).toBeNull();
  });
});
