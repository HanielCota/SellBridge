import { describe, expect, it } from "vitest";
import { createRedisSlotStore } from "./redis-slots.ts";

function queueRunning(runCommand: (name: string, args: string[]) => Promise<unknown>) {
  return { getBackend: () => ({ client: Promise.resolve({ runCommand }) }) };
}

describe("createRedisSlotStore", () => {
  it("reserves the slot with one atomic script on a namespaced key", async () => {
    const calls: { name: string; args: string[] }[] = [];
    const store = createRedisSlotStore(
      queueRunning(async (name, args) => {
        calls.push({ name, args });
        return 120;
      }),
      "bling",
    );

    const wait = await store.reserve("supplier-1", 333.4);

    expect(wait).toBe(120);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe("eval");
    expect(calls[0]?.args.slice(1)).toEqual(["1", "sellbridge:rate-slot:bling:supplier-1", "334"]);
  });

  it("rejects an answer that is not a wait in milliseconds", async () => {
    const store = createRedisSlotStore(
      queueRunning(async () => "OK"),
      "bling",
    );

    await expect(store.reserve("supplier-1", 333)).rejects.toThrow(/answered OK/);
  });

  it("refuses a spacing that is not positive", async () => {
    const store = createRedisSlotStore(
      queueRunning(async () => 0),
      "bling",
    );

    await expect(store.reserve("supplier-1", 0)).rejects.toThrow(RangeError);
  });

  it("gives up after a second instead of waiting for Redis forever", async () => {
    const store = createRedisSlotStore(
      queueRunning(async () => new Promise(() => {})),
      "bling",
    );

    await expect(store.reserve("supplier-1", 333)).rejects.toThrow(/prazo/);
  });
});
