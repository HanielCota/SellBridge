import { describe, expect, it } from "vitest";
import { hasStaffPermission, isStaffRole, staffRoleOf } from "./staff-access.ts";

describe("staffRoleOf", () => {
  it("recognises the team roles and leaves resellers out", () => {
    expect(staffRoleOf("agent")).toBe("agent");
    expect(staffRoleOf("supervisor")).toBe("supervisor");
    expect(staffRoleOf("admin")).toBe("admin");
    expect(staffRoleOf("user")).toBeNull();
    expect(staffRoleOf(null)).toBeNull();
    expect(staffRoleOf(undefined)).toBeNull();
    expect(staffRoleOf("Admin")).toBeNull();
    expect(isStaffRole("user")).toBe(false);
    expect(isStaffRole("agent")).toBe(true);
  });
});

describe("hasStaffPermission", () => {
  it("lets an agent answer and triage, but not hand tickets to others or see metrics", () => {
    expect(hasStaffPermission("agent", "support.answer")).toBe(true);
    expect(hasStaffPermission("agent", "support.triage")).toBe(true);
    expect(hasStaffPermission("agent", "support.assign_others")).toBe(false);
    expect(hasStaffPermission("agent", "support.metrics")).toBe(false);
    expect(hasStaffPermission("agent", "customers.manage")).toBe(false);
  });

  it("lets a supervisor run the queue without touching customer accounts", () => {
    expect(hasStaffPermission("supervisor", "support.assign_others")).toBe(true);
    expect(hasStaffPermission("supervisor", "support.metrics")).toBe(true);
    expect(hasStaffPermission("supervisor", "customers.manage")).toBe(false);
  });

  it("gives admins everything and resellers nothing", () => {
    expect(hasStaffPermission("admin", "customers.manage")).toBe(true);
    expect(hasStaffPermission("admin", "support.metrics")).toBe(true);
    expect(hasStaffPermission("user", "support.answer")).toBe(false);
    expect(hasStaffPermission(null, "support.answer")).toBe(false);
  });
});
