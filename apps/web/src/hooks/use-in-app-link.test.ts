import { describe, expect, it } from "vitest";
import { opensElsewhere } from "./use-in-app-link";

const plain = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };

describe("opensElsewhere", () => {
  it("keeps a plain click inside the app", () => {
    expect(opensElsewhere(plain)).toBe(false);
  });

  it("leaves new-tab and new-window clicks to the browser", () => {
    expect(opensElsewhere({ ...plain, ctrlKey: true })).toBe(true);
    expect(opensElsewhere({ ...plain, metaKey: true })).toBe(true);
    expect(opensElsewhere({ ...plain, shiftKey: true })).toBe(true);
    expect(opensElsewhere({ ...plain, button: 1 })).toBe(true);
  });
});
