import { hasStaffPermission } from "@sellbridge/shared/staff-access";
import { describe, expect, it } from "vitest";
import { ADMIN_NAV_ITEMS } from "@/features/navigation/nav-items";
import { decodeProblemCursor, encodeProblemCursor } from "./problem-cursor";

describe("Problemas access", () => {
  it("sits in the team menu behind the admins-only audit permission", () => {
    const item = ADMIN_NAV_ITEMS.find((navItem) => navItem.to === "/admin/problemas");

    expect(item?.permission).toBe("audit.view");
  });

  it.each([
    ["admin", true],
    ["supervisor", false],
    ["agent", false],
    ["user", false],
    [null, false],
  ])("lets %s read problems: %s", (role, allowed) => {
    expect(hasStaffPermission(role, "audit.view")).toBe(allowed);
  });
});

describe("problem cursor", () => {
  it("reads back what it wrote", () => {
    const cursor = {
      lastSeenAt: new Date("2026-11-13T14:02:00.123Z"),
      id: "3f2a1b4c-1d2e-4f50-8a9b-0c1d2e3f4a5b",
    };

    const decoded = decodeProblemCursor(encodeProblemCursor(cursor) ?? undefined);

    expect(decoded).toEqual(cursor);
  });

  it("has no cursor after the last page", () => {
    expect(encodeProblemCursor(null)).toBeNull();
    expect(decodeProblemCursor(undefined)).toBeUndefined();
  });

  it("refuses a cursor without a date", () => {
    expect(() => decodeProblemCursor("not-a-date_3f2a1b4c")).toThrow(RangeError);
  });
});
