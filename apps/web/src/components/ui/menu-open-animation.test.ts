import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

// Radix marks open menus with data-state="open"; it never sets a bare data-open attribute, so the
// data-open: variant left these menus without their opening animation.
const MENU_FILES = [
  "./select.tsx",
  "./dropdown-menu.tsx",
  "./popover.tsx",
  "../layout/notification-bell.tsx",
] as const;

describe("menu open animation", () => {
  test.each(MENU_FILES)("%s animates on the state Radix actually sets", (file) => {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");

    expect(source).not.toMatch(/\bdata-(open|closed):/);
    expect(source).toContain("data-[state=open]:animate-in");
  });
});
