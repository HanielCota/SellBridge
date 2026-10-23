import { describe, expect, it } from "vitest";
import { DAY_MILLISECONDS } from "./time.ts";
import {
  applySupplierFlagSchema,
  deactivatingFlagNotice,
  flagDeactivatesSupplier,
  reachedFlagLimit,
  revokeSupplierFlagSchema,
  SUPPLIER_FLAG_LIMIT,
  SUPPLIER_FLAG_LIMIT_WARNING,
  SUPPLIER_FLAG_NOTE_MAX_LENGTH,
  SUPPLIER_FLAG_REASON_LABELS,
  SUPPLIER_FLAG_REASONS,
  SUPPLIER_FLAG_VALIDITY_DAYS,
  supplierFlagCountLabel,
  supplierFlagExpiresAt,
  supplierFlagStatus,
  newestFlagsFirst,
} from "./supplier-flags.ts";

const SUPPLIER = "8d0c0a52-3b4f-4bb0-9a49-2f1f5d1f7c11";
const FLAG = "1b6f3a8e-2c4d-4e5f-8a9b-0c1d2e3f4a5b";
const APPLIED_AT = new Date("2026-07-01T12:00:00.000Z");

function daysAfter(days: number): Date {
  return new Date(APPLIED_AT.getTime() + days * DAY_MILLISECONDS);
}

function flagAppliedAt(createdAt: Date, revokedAt: Date | null = null) {
  return { expiresAt: supplierFlagExpiresAt(createdAt), revokedAt };
}

describe("supplier flag lifetime", () => {
  it("lasts 90 days from the day it was applied", () => {
    expect(SUPPLIER_FLAG_VALIDITY_DAYS).toBe(90);
    expect(supplierFlagExpiresAt(APPLIED_AT).toISOString()).toBe("2026-09-29T12:00:00.000Z");
  });

  it("is active at 89 days", () => {
    expect(supplierFlagStatus(flagAppliedAt(APPLIED_AT), daysAfter(89))).toBe("active");
  });

  it("is still active one millisecond before the 90th day", () => {
    const now = new Date(daysAfter(90).getTime() - 1);
    expect(supplierFlagStatus(flagAppliedAt(APPLIED_AT), now)).toBe("active");
  });

  it("is expired exactly at 90 days", () => {
    expect(supplierFlagStatus(flagAppliedAt(APPLIED_AT), daysAfter(90))).toBe("expired");
  });

  it("is expired at 91 days", () => {
    expect(supplierFlagStatus(flagAppliedAt(APPLIED_AT), daysAfter(91))).toBe("expired");
  });

  it("does not count once revoked, even inside the 90 days", () => {
    const revoked = flagAppliedAt(APPLIED_AT, daysAfter(2));
    expect(supplierFlagStatus(revoked, daysAfter(10))).toBe("revoked");
  });
});

describe("supplier flag counter", () => {
  it("reads as X of 3 in 90 days", () => {
    expect(SUPPLIER_FLAG_LIMIT).toBe(3);
    expect(supplierFlagCountLabel(1)).toBe("1 de 3 em 90 dias");
    expect(supplierFlagCountLabel(0)).toBe("0 de 3 em 90 dias");
  });

  it("reaches the limit at 3 active flags", () => {
    expect(reachedFlagLimit(2)).toBe(false);
    expect(reachedFlagLimit(3)).toBe(true);
    expect(reachedFlagLimit(4)).toBe(true);
  });

  it("tells the supplier the 3rd flag turns the account off", () => {
    expect(SUPPLIER_FLAG_LIMIT_WARNING).toBe("Na 3ª flag a conta é desligada.");
  });
});

describe("three strikes", () => {
  it("deactivates an active supplier only with the flag that would be the 3rd active one", () => {
    expect(flagDeactivatesSupplier({ activeFlagCount: 0, supplierActive: true })).toBe(false);
    expect(flagDeactivatesSupplier({ activeFlagCount: 1, supplierActive: true })).toBe(false);
    expect(flagDeactivatesSupplier({ activeFlagCount: 2, supplierActive: true })).toBe(true);
  });

  it("deactivates again a supplier the team reactivated while it still had 3 flags", () => {
    expect(flagDeactivatesSupplier({ activeFlagCount: 3, supplierActive: true })).toBe(true);
  });

  it("has nothing to deactivate when the supplier is already off", () => {
    expect(flagDeactivatesSupplier({ activeFlagCount: 2, supplierActive: false })).toBe(false);
  });

  it("never counts past 3 when warning about a reactivated supplier", () => {
    expect(deactivatingFlagNotice(2)).toBe("Esta é a flag 3 de 3: o fornecedor será desligado");
    expect(deactivatingFlagNotice(3)).toBe(
      "O fornecedor foi reativado com 3 flags ativas: esta flag o desliga de novo",
    );
  });
});

describe("supplier flag reasons", () => {
  it("has a plain label for every reason", () => {
    expect(SUPPLIER_FLAG_REASONS).toEqual([
      "product_listing_error",
      "stale_catalog",
      "slow_support",
      "order_error",
      "contact_attempt",
      "other",
    ]);
    expect(SUPPLIER_FLAG_REASON_LABELS.stale_catalog).toBe("Catálogo ou estoque desatualizado");
    expect(SUPPLIER_FLAG_REASON_LABELS.contact_attempt).toBe(
      "Tentou passar contato fora da plataforma",
    );
  });
});

describe("applySupplierFlagSchema", () => {
  it("accepts a reason with no note", () => {
    const parsed = applySupplierFlagSchema.parse({
      supplierId: SUPPLIER,
      reason: "slow_support",
      note: "",
    });
    expect(parsed).toEqual({
      supplierId: SUPPLIER,
      reason: "slow_support",
      note: "",
      confirmDeactivation: false,
    });
  });

  it("keeps the confirmation to deactivate the supplier when the team ticks it", () => {
    const parsed = applySupplierFlagSchema.parse({
      supplierId: SUPPLIER,
      reason: "slow_support",
      note: "",
      confirmDeactivation: true,
    });
    expect(parsed.confirmDeactivation).toBe(true);
  });

  it("refuses 'other' without a note", () => {
    const parsed = applySupplierFlagSchema.safeParse({
      supplierId: SUPPLIER,
      reason: "other",
      note: "   ",
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["note"]);
  });

  it("refuses 'other' with a note made only of invisible characters", () => {
    const note = "​⁠ ﻿";
    expect(
      applySupplierFlagSchema.safeParse({ supplierId: SUPPLIER, reason: "other", note }).success,
    ).toBe(false);
  });

  it("keeps a note whose emoji join with invisible characters", () => {
    const note = "👨‍👩‍👧";
    expect(
      applySupplierFlagSchema.parse({ supplierId: SUPPLIER, reason: "other", note }).note,
    ).toBe(note);
  });

  it("accepts a note of exactly 500 characters", () => {
    const note = "a".repeat(SUPPLIER_FLAG_NOTE_MAX_LENGTH);
    expect(
      applySupplierFlagSchema.safeParse({ supplierId: SUPPLIER, reason: "other", note }).success,
    ).toBe(true);
  });

  it("refuses a note of 501 characters", () => {
    const note = "a".repeat(SUPPLIER_FLAG_NOTE_MAX_LENGTH + 1);
    expect(
      applySupplierFlagSchema.safeParse({ supplierId: SUPPLIER, reason: "other", note }).success,
    ).toBe(false);
  });

  it("counts an emoji as one character, like the database does", () => {
    const note = "🙂".repeat(SUPPLIER_FLAG_NOTE_MAX_LENGTH);
    expect(
      applySupplierFlagSchema.safeParse({ supplierId: SUPPLIER, reason: "other", note }).success,
    ).toBe(true);
  });

  it("refuses an unknown reason and a supplier id that is not a uuid", () => {
    expect(
      applySupplierFlagSchema.safeParse({ supplierId: SUPPLIER, reason: "spam", note: "" }).success,
    ).toBe(false);
    expect(
      applySupplierFlagSchema.safeParse({ supplierId: "1 or 1=1", reason: "other", note: "x" })
        .success,
    ).toBe(false);
  });
});

describe("revokeSupplierFlagSchema", () => {
  it("asks for a note when a flag is revoked", () => {
    expect(
      revokeSupplierFlagSchema.safeParse({ supplierId: SUPPLIER, flagId: FLAG, revokeNote: " " })
        .success,
    ).toBe(false);
    expect(
      revokeSupplierFlagSchema.parse({
        supplierId: SUPPLIER,
        flagId: FLAG,
        revokeNote: " Aplicada por engano ",
      }).revokeNote,
    ).toBe("Aplicada por engano");
  });

  it("refuses a revoke note made only of invisible characters", () => {
    expect(
      revokeSupplierFlagSchema.safeParse({
        supplierId: SUPPLIER,
        flagId: FLAG,
        revokeNote: "​​",
      }).success,
    ).toBe(false);
  });

  it("refuses a revoke note of 501 characters", () => {
    const revokeNote = "a".repeat(SUPPLIER_FLAG_NOTE_MAX_LENGTH + 1);
    expect(
      revokeSupplierFlagSchema.safeParse({ supplierId: SUPPLIER, flagId: FLAG, revokeNote })
        .success,
    ).toBe(false);
  });
});

describe("newestFlagsFirst", () => {
  it("lists the most recent flag first, without changing the list it got", () => {
    const flags = [
      { id: "b", createdAt: daysAfter(1) },
      { id: "c", createdAt: daysAfter(5) },
      { id: "a", createdAt: daysAfter(1) },
    ];
    expect(newestFlagsFirst(flags).map((flag) => flag.id)).toEqual(["c", "b", "a"]);
    expect(flags.map((flag) => flag.id)).toEqual(["b", "c", "a"]);
  });
});
