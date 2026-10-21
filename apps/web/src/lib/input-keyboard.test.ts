import { describe, expect, it } from "vitest";
import { keyboardDefaultsForType } from "./input-keyboard";

describe("keyboardDefaultsForType", () => {
  it("opens the e-mail keyboard without autocorrect for e-mail fields", () => {
    expect(keyboardDefaultsForType("email")).toEqual({
      inputMode: "email",
      autoCapitalize: "off",
      autoCorrect: "off",
      spellCheck: false,
    });
  });

  it("opens the URL keyboard for URL fields", () => {
    expect(keyboardDefaultsForType("url").inputMode).toBe("url");
  });

  it("turns the return key into search for search fields", () => {
    expect(keyboardDefaultsForType("search")).toEqual({ enterKeyHint: "search" });
  });

  it("leaves plain text fields untouched", () => {
    expect(keyboardDefaultsForType(undefined)).toEqual({});
    expect(keyboardDefaultsForType("text")).toEqual({});
  });
});
