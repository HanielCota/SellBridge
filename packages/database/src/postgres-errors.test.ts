import { describe, expect, it } from "vitest";
import { isUniqueViolation } from "./postgres-errors.ts";

const INDEX = "store_connections_live_shop_idx";

function driverError(code: string, constraintName: string) {
  return Object.assign(new Error("duplicate key"), { code, constraint_name: constraintName });
}

describe("isUniqueViolation", () => {
  it("recognizes the index inside Drizzle's wrapped error and the driver's own error", () => {
    const wrapped = new Error("Failed query", { cause: driverError("23505", INDEX) });
    expect(isUniqueViolation(wrapped, INDEX)).toBe(true);
    expect(isUniqueViolation(driverError("23505", INDEX), INDEX)).toBe(true);
  });

  it("ignores other indexes, other errors and values that are not errors", () => {
    expect(isUniqueViolation(driverError("23505", "store_connections_shop_idx"), INDEX)).toBe(
      false,
    );
    expect(isUniqueViolation(driverError("23503", INDEX), INDEX)).toBe(false);
    expect(isUniqueViolation(new Error("timeout"), INDEX)).toBe(false);
    expect(isUniqueViolation(null, INDEX)).toBe(false);
    expect(isUniqueViolation("23505", INDEX)).toBe(false);
  });
});
