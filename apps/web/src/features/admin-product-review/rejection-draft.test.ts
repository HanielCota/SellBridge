import { describe, expect, it } from "vitest";
import {
  addIssueReason,
  addPresetReason,
  checkRejection,
  removeReason,
  updateReason,
} from "./rejection-draft";

describe("rejection draft", () => {
  it("adds a preset with its field and message, edits and removes it by key", () => {
    const added = addPresetReason([], "image_quality", "a");
    expect(added).toEqual([
      expect.objectContaining({ key: "a", field: "imageUrls", rule: "image_quality" }),
    ]);
    const edited = updateReason(added, "a", { message: "Troque a foto principal." });
    expect(edited[0]?.message).toBe("Troque a foto principal.");
    expect(added[0]?.message).not.toBe("Troque a foto principal.");
    expect(removeReason(edited, "a")).toEqual([]);
  });

  it("refuses a rejection without any reason", () => {
    const check = checkRejection([]);
    expect(check.valid).toBe(false);
    expect(check.valid ? null : check.formError).toMatch(/pelo menos um motivo/);
  });

  it("points a too-short message at the reason that has it", () => {
    const reasons = updateReason(
      addPresetReason(addPresetReason([], "title_policy", "a"), "other", "b"),
      "b",
      { message: "ruim" },
    );
    const check = checkRejection(reasons);
    expect(check.valid).toBe(false);
    expect(check.valid ? null : [...check.byKey.keys()]).toEqual(["b"]);
  });

  it("sends only field, rule and message once every reason is valid", () => {
    const check = checkRejection(addPresetReason([], "wrong_category", "a"));
    expect(check.valid ? check.reasons : null).toEqual([expect.not.objectContaining({ key: "a" })]);
  });
});

describe("addIssueReason", () => {
  it("turns a completeness issue into a reason only once", () => {
    const issue = { field: "imageUrls", rule: "min_images", message: "Adicione 3 imagens." };
    const once = addIssueReason([], issue, "a");
    expect(once).toEqual([{ ...issue, key: "a" }]);
    expect(addIssueReason(once, issue, "b")).toHaveLength(1);
  });
});
