import { describe, expect, it } from "vitest";
import { DEFAULT_RETURN_PATH, safeReturnPath } from "./impersonation-return";

describe("safeReturnPath", () => {
  it("goes back to the ticket the visit started from", () => {
    expect(safeReturnPath("/admin/chamados/6cfb95?perfil=x")).toBe(
      "/admin/chamados/6cfb95?perfil=x",
    );
  });

  it("sends an agent to the inbox, not to the admin-only customer pages, when nothing was kept", () => {
    expect(safeReturnPath(null)).toBe(DEFAULT_RETURN_PATH);
  });

  it.each(["//evil.test/admin", "https://evil.test/admin", "/administrador", "/dashboard", ""])(
    "never leaves the admin for %s",
    (stored) => {
      expect(safeReturnPath(stored)).toBe(DEFAULT_RETURN_PATH);
    },
  );
});
