import { describe, expect, it } from "vitest";
import { hasLoneSurrogate, readTextWithin } from "./http-body.ts";

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

describe("hasLoneSurrogate", () => {
  it("finds a lone half of a UTF-16 pair", () => {
    expect(hasLoneSurrogate({ text: "a\ud800" })).toBe(true);
    expect(hasLoneSurrogate({ text: "\udc00b" })).toBe(true);
  });

  // Regression: a backslash right before the lone half (`"\\\ud800"` in JSON) hid it from the
  // one-backslash lookbehind, and the jsonb insert failed with a 500.
  it("finds a lone half right after a backslash", () => {
    expect(hasLoneSurrogate({ text: "\\\ud800" })).toBe(true);
    expect(hasLoneSurrogate({ text: "\\\\\ud800" })).toBe(true);
  });

  it("accepts well-formed text, emoji and escaped backslashes", () => {
    expect(hasLoneSurrogate({ text: "pedido 😀 ok" })).toBe(false);
    expect(hasLoneSurrogate({ text: String.raw`\ud800 is text here` })).toBe(false);
    expect(hasLoneSurrogate(null)).toBe(false);
  });
});
