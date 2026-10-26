import { describe, expect, it, vi } from "vitest";
import { createAsyncCache } from "./async-cache";

describe("createAsyncCache", () => {
  it("coalesces concurrent reads and starts the TTL after the load completes", async () => {
    let now = 0;
    let finish!: (value: string) => void;
    const load = vi.fn<() => Promise<string>>(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const read = createAsyncCache({ load, maxEntries: 2, ttlMilliseconds: 100, now: () => now });
    const first = read("a");
    const second = read("a");
    expect(second).toBe(first);
    await Promise.resolve();
    now = 1000;
    finish("value");
    await expect(first).resolves.toBe("value");
    now = 1099;
    await expect(read("a")).resolves.toBe("value");
    expect(load).toHaveBeenCalledTimes(1);
    now = 1100;
    const expired = read("a");
    await Promise.resolve();
    finish("fresh");
    await expect(expired).resolves.toBe("fresh");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not cache failures and isolates keys", async () => {
    const load = vi
      .fn<(key: string) => Promise<string>>(async (key) => key)
      .mockRejectedValueOnce(new Error("offline"));
    const read = createAsyncCache({ load, maxEntries: 2, ttlMilliseconds: 100 });
    await expect(read("a")).rejects.toThrow("offline");
    expect(await Promise.all([read("a"), read("b")])).toEqual(["a", "b"]);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("evicts the least recently used key", async () => {
    const load = vi.fn<(key: string) => Promise<string>>(async (key) => key);
    const read = createAsyncCache({ load, maxEntries: 2, ttlMilliseconds: 1000 });
    await read("a");
    await read("b");
    await read("a");
    await read("c");
    await read("a");
    await read("b");
    expect(load.mock.calls.map(([key]) => key)).toEqual(["a", "b", "c", "b"]);
  });

  it("uses a short cooldown for an empty fallback before retrying", async () => {
    let now = 0;
    const load = vi
      .fn<() => Promise<string[]>>(async () => [])
      .mockResolvedValueOnce([])
      .mockResolvedValue(["city"]);
    const read = createAsyncCache({
      load,
      maxEntries: 1,
      ttlMilliseconds: (value) => (value.length === 0 ? 10 : 1000),
      now: () => now,
    });
    await read("state");
    now = 9;
    expect(await read("state")).toEqual([]);
    now = 10;
    expect(await read("state")).toEqual(["city"]);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
