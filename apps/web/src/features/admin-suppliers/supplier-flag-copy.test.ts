import { describe, expect, it } from "vitest";
import { formatFlagDate, supplierNoticeDatesLine, teamFlagDatesLine } from "./supplier-flag-copy";

const createdAt = new Date("2026-10-12T15:00:00Z");
const expiresAt = new Date("2027-01-10T15:00:00Z");
const base = {
  createdAt,
  expiresAt,
  createdByName: "Ana",
  revokedAt: null,
  revokedByName: null,
};

describe("supplier flag copy", () => {
  it("writes dates in Brazil time, so a late flag keeps its own day", () => {
    expect(formatFlagDate(new Date("2026-10-13T02:30:00Z"))).toBe("12/10/2026");
  });

  it("tells the team when an active flag was applied, by whom and until when it counts", () => {
    expect(teamFlagDatesLine({ ...base, status: "active" })).toBe(
      "Aplicada em 12/10/2026 por Ana · vale até 10/01/2027",
    );
  });

  it("tells the team when a flag expired or was revoked", () => {
    expect(teamFlagDatesLine({ ...base, status: "expired" })).toBe(
      "Aplicada em 12/10/2026 por Ana · venceu em 10/01/2027",
    );
    expect(
      teamFlagDatesLine({
        ...base,
        createdByName: null,
        revokedAt: new Date("2026-10-14T15:00:00Z"),
        revokedByName: "Bruno",
        status: "revoked",
      }),
    ).toBe("Aplicada em 12/10/2026 · retirada em 14/10/2026 por Bruno");
  });

  it("shows the supplier only the dates", () => {
    expect(supplierNoticeDatesLine({ createdAt, expiresAt })).toBe(
      "Recebido em 12/10/2026 · vale até 10/01/2027",
    );
  });
});
