import { loadRootEnvironmentFile } from "@sellbridge/shared/environment-file";
import { Queue } from "bullmq";
import { afterAll, describe, expect, it } from "vitest";
import { createRedisUnchangedReads } from "./unchanged-reads.ts";

loadRootEnvironmentFile();
const redisUrl = process.env.REDIS_URL;
if (redisUrl === undefined || redisUrl === "") {
  throw new Error("REDIS_URL é obrigatória para o teste do contador da conferência");
}

const queue = new Queue(`unchanged-reads-${crypto.randomUUID()}`, {
  connection: { url: redisUrl },
});
const LIFETIME_IN_MS = 60_000;

afterAll(async () => {
  await queue.close();
});

describe("createRedisUnchangedReads", () => {
  it("counts each unchanged read of one sale, shared by every reader of the same Redis", async () => {
    const key = `test:${crypto.randomUUID()}`;
    const first = createRedisUnchangedReads(queue, LIFETIME_IN_MS);
    const second = createRedisUnchangedReads(queue, LIFETIME_IN_MS);

    await first.add(key);
    await second.add(key);

    expect(await first.count(key)).toBe(2);
  });

  it("starts at zero for a sale never counted", async () => {
    const reads = createRedisUnchangedReads(queue, LIFETIME_IN_MS);

    expect(await reads.count(`test:${crypto.randomUUID()}`)).toBe(0);
  });
});
