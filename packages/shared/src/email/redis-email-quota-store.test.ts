import { describe, expect, it } from "vitest";
import { createRedisEmailQuotaStore } from "./redis-email-quota-store.ts";

function queueRunning(runCommand: (name: string, args: string[]) => Promise<unknown>) {
  return { getBackend: () => ({ client: Promise.resolve({ runCommand }) }) };
}

const reservation = {
  systemKey: "quota:system",
  recipientKey: "quota:to:abc",
  systemLimit: 500,
  recipientLimit: 50,
  ttlInSeconds: 172_800,
};

describe("createRedisEmailQuotaStore", () => {
  it("counts on both keys with one atomic script", async () => {
    const calls: { name: string; args: string[] }[] = [];
    const store = createRedisEmailQuotaStore(
      queueRunning(async (name, args) => {
        calls.push({ name, args });
        return 0;
      }),
    );

    const result = await store.reserve(reservation);

    expect(result).toBe("reserved");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe("eval");
    expect(calls[0]?.args.slice(1)).toEqual([
      "2",
      "quota:system",
      "quota:to:abc",
      "500",
      "50",
      "172800",
    ]);
  });

  it.each([
    [1, "system_full"],
    [2, "recipient_full"],
  ])("reads answer %s as %s", async (answer, expected) => {
    const store = createRedisEmailQuotaStore(queueRunning(async () => answer));

    expect(await store.reserve(reservation)).toBe(expected);
  });

  it("rejects an answer it does not know, instead of sending uncounted", async () => {
    const store = createRedisEmailQuotaStore(queueRunning(async () => "OK"));

    await expect(store.reserve(reservation)).rejects.toThrow(/answered OK/);
  });

  it("gives up after a second instead of waiting for Redis forever", async () => {
    const store = createRedisEmailQuotaStore(queueRunning(async () => new Promise(() => {})));

    await expect(store.reserve(reservation)).rejects.toThrow(/prazo/);
  });

  it("claims a key for the first caller only", async () => {
    const answers: unknown[] = ["OK", null];
    const calls: string[][] = [];
    const store = createRedisEmailQuotaStore(
      queueRunning(async (_name, args) => {
        calls.push(args);
        return answers.shift();
      }),
    );

    const first = await store.claimOnce("quota:alerted", 60);
    const second = await store.claimOnce("quota:alerted", 60);

    expect([first, second]).toEqual([true, false]);
    expect(calls[0]).toEqual(["quota:alerted", "1", "EX", "60", "NX"]);
  });
});
