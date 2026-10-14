import { describe, expect, it } from "vitest";
import { parseJsonFindingNul, withoutNul } from "./nul-character";

const NUL = String.fromCharCode(0);

describe("NUL character", () => {
  it("finds it in values and keys, escaped or raw", () => {
    expect(parseJsonFindingNul(String.raw`{"note":"x\u0000y"}`).hasNul).toBe(true);
    expect(parseJsonFindingNul(String.raw`{"note\u0000":1}`).hasNul).toBe(true);
    expect(parseJsonFindingNul(JSON.stringify({ note: `x${NUL}y` })).hasNul).toBe(true);
    expect(parseJsonFindingNul(`{"note":"xy"}`).hasNul).toBe(false);
  });

  it("leaves an escaped backslash followed by u0000 alone", () => {
    const literal = String.raw`\u0000`;
    const parsed = parseJsonFindingNul(String.raw`{"note":"\\u0000","code":"x"}`);
    expect(parsed).toEqual({ value: { note: literal, code: "x" }, hasNul: false });
    expect(withoutNul({ note: literal, code: "x" })).toEqual({ note: literal, code: "x" });
  });

  it("removes it from strings and drops keys holding it", () => {
    expect(withoutNul({ note: `a${NUL}b`, [`key${NUL}`]: 1, list: [`${NUL}c`] })).toEqual({
      note: "ab",
      list: ["c"],
    });
    expect(withoutNul(undefined)).toBeNull();
  });
});
