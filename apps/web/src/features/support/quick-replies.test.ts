import { describe, expect, it } from "vitest";
import { appendQuickReply, quickRepliesFor } from "./quick-replies";

describe("quick replies", () => {
  it("adds the category's own snippets after the common ones", () => {
    expect(quickRepliesFor("store")).toEqual([
      "Segue o print",
      "Ainda não resolveu",
      "Já tentei reconectar a loja",
    ]);
  });

  it("appends a snippet as its own sentence", () => {
    expect(appendQuickReply("", "Segue o print", 5000)).toBe("Segue o print. ");
    expect(appendQuickReply("Oi!  ", "Segue o print", 5000)).toBe("Oi! Segue o print. ");
  });

  it("keeps the text as it is when the snippet would pass the limit", () => {
    const full = "a".repeat(4990);
    expect(appendQuickReply(full, "Segue o print", 5000)).toBe(full);
  });
});
