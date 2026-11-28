import { describe, expect, test } from "vitest";
import { parseSupportPosition } from "./support-position-storage";

describe("parseSupportPosition", () => {
  test("reads a saved spot", () => {
    expect(parseSupportPosition('{"inline":0.25,"vertical":0.5}')).toEqual({
      inline: 0.25,
      vertical: 0.5,
    });
  });

  test("starts in the corner when nothing was saved", () => {
    expect(parseSupportPosition(null)).toBeNull();
    expect(parseSupportPosition("  ")).toBeNull();
  });

  test("ignores a value that is not JSON", () => {
    expect(parseSupportPosition("left-top")).toBeNull();
  });

  test("ignores a spot outside the room beside the sidebar", () => {
    expect(parseSupportPosition('{"inline":-0.1,"vertical":0.5}')).toBeNull();
    expect(parseSupportPosition('{"inline":0.5,"vertical":1.2}')).toBeNull();
  });

  test("ignores missing or non-numeric fractions", () => {
    expect(parseSupportPosition('{"inline":0.5}')).toBeNull();
    expect(parseSupportPosition('{"inline":"0.5","vertical":0.5}')).toBeNull();
    expect(parseSupportPosition("[0.5,0.5]")).toBeNull();
  });
});
