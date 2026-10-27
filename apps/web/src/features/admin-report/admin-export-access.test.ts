import { describe, expect, it } from "vitest";
import { adminExportHref, allowedExports } from "./admin-download-links";
import { adminModeFromCookie, exportRefusal } from "./admin-export-access";

const ON = { signedIn: true, adminMode: true };

describe("admin spreadsheet access", () => {
  it("asks to sign in, then for a team role, then for admin mode", () => {
    expect(
      exportRefusal({ signedIn: false, role: null, adminMode: false }, "support.metrics")?.status,
    ).toBe(401);
    expect(exportRefusal({ ...ON, role: "user" }, "support.metrics")?.status).toBe(403);
    expect(
      exportRefusal({ ...ON, role: "admin", adminMode: false }, "support.metrics")?.message,
    ).toContain("modo equipe");
  });

  it("lets an agent take no admin spreadsheet and a supervisor only the support ones", () => {
    for (const permission of ["support.metrics", "customers.manage", "audit.view"] as const) {
      expect(exportRefusal({ ...ON, role: "agent" }, permission)?.status).toBe(403);
    }
    expect(exportRefusal({ ...ON, role: "supervisor" }, "support.metrics")).toBeNull();
    expect(exportRefusal({ ...ON, role: "supervisor" }, "customers.manage")?.status).toBe(403);
    expect(exportRefusal({ ...ON, role: "supervisor" }, "audit.view")?.status).toBe(403);
    expect(exportRefusal({ ...ON, role: "admin" }, "audit.view")).toBeNull();
  });

  it("only offers the files the role may take", () => {
    const all = ["equipe", "chamados", "clientes", "auditoria"] as const;
    expect(allowedExports("agent", all)).toEqual([]);
    expect(allowedExports("supervisor", all)).toEqual(["equipe", "chamados"]);
    expect(allowedExports("admin", all)).toEqual([...all]);
  });

  it("reads admin mode from the cookie header", () => {
    expect(adminModeFromCookie("a=1; sellbridge-admin-mode=on")).toBe(true);
    expect(adminModeFromCookie("sellbridge-admin-mode=off")).toBe(false);
    expect(adminModeFromCookie(null)).toBe(false);
  });

  it("carries the period and hides names only when asked", () => {
    expect(adminExportHref("equipe", { mes: "2026-10" })).toBe(
      "/api/admin/exportar/equipe?mes=2026-10",
    );
    expect(adminExportHref("chamados", { de: "2026-10-01", ate: "2026-10-15" }, false)).toBe(
      "/api/admin/exportar/chamados?de=2026-10-01&ate=2026-10-15&nomes=0",
    );
  });
});
