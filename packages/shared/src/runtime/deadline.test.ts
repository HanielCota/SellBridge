import { describe, expect, it } from "vitest";
import { DeadlineExceededError, withDeadline } from "./deadline.ts";

describe("withDeadline", () => {
  it("returns the result of an operation that finishes in time", async () => {
    await expect(withDeadline(Promise.resolve(42), 50, "operação")).resolves.toBe(42);
  });

  it("rejects once the deadline passes on a hanging operation", async () => {
    const hanging = new Promise<never>(() => {});
    await expect(withDeadline(hanging, 10, "enqueue")).rejects.toBeInstanceOf(
      DeadlineExceededError,
    );
  });

  it("propagates the operation's own error", async () => {
    await expect(withDeadline(Promise.reject(new Error("redis")), 50, "x")).rejects.toThrow(
      "redis",
    );
  });
});
