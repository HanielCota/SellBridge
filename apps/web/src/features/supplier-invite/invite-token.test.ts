import { describe, expect, it } from "vitest";
import { readSupplierInvite, signSupplierInvite, SUPPLIER_INVITE_DAYS } from "./invite-token";

const SECRET = "test-secret-with-enough-length-0123456789";
const SUPPLIER_ID = "0b7a4d2e-3c1f-4a5b-9c8d-7e6f5a4b3c2d";
const ISSUED_AT = new Date("2026-11-18T12:00:00Z");
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

function issue() {
  return signSupplierInvite({ supplierId: SUPPLIER_ID, now: ISSUED_AT, secret: SECRET });
}

describe("supplier invite token", () => {
  it("reads back the supplier of an invite it signed", () => {
    const token = issue();

    const reading = readSupplierInvite({ token, now: ISSUED_AT, secret: SECRET });

    expect(reading).toEqual({ status: "valid", supplierId: SUPPLIER_ID });
  });

  it("still opens one minute before the invite runs out", () => {
    const token = issue();
    const almostOver = new Date(
      ISSUED_AT.getTime() + SUPPLIER_INVITE_DAYS * DAY_IN_MILLISECONDS - 60_000,
    );

    const reading = readSupplierInvite({ token, now: almostOver, secret: SECRET });

    expect(reading.status).toBe("valid");
  });

  it("calls an invite past its days expired", () => {
    const token = issue();
    const after = new Date(ISSUED_AT.getTime() + SUPPLIER_INVITE_DAYS * DAY_IN_MILLISECONDS);

    const reading = readSupplierInvite({ token, now: after, secret: SECRET });

    expect(reading).toEqual({ status: "expired" });
  });

  it("refuses an invite signed with another secret", () => {
    const token = signSupplierInvite({
      supplierId: SUPPLIER_ID,
      now: ISSUED_AT,
      secret: "another-secret-with-enough-length-98765",
    });

    const reading = readSupplierInvite({ token, now: ISSUED_AT, secret: SECRET });

    expect(reading).toEqual({ status: "invalid" });
  });

  it("refuses an invite whose supplier was swapped", () => {
    const [, expiresAt, signature] = issue().split(".");
    const swapped = `1c8b5e3f-4d2a-4b6c-8d9e-8f7a6b5c4d3e.${expiresAt}.${signature}`;

    const reading = readSupplierInvite({ token: swapped, now: ISSUED_AT, secret: SECRET });

    expect(reading).toEqual({ status: "invalid" });
  });

  it("refuses an invite whose expiry was pushed forward", () => {
    const [supplierId, expiresAt, signature] = issue().split(".");
    const later = `${supplierId}.${Number(expiresAt) + 86_400}.${signature}`;

    const reading = readSupplierInvite({ token: later, now: ISSUED_AT, secret: SECRET });

    expect(reading).toEqual({ status: "invalid" });
  });

  it.each(["", "not-a-token", `${SUPPLIER_ID}.123`, "a".repeat(200)])(
    "refuses the malformed invite %j",
    (token) => {
      const reading = readSupplierInvite({ token, now: ISSUED_AT, secret: SECRET });

      expect(reading).toEqual({ status: "invalid" });
    },
  );
});
