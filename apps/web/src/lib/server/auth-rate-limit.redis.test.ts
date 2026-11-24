import { loadRootEnvironmentFile } from "@sellbridge/shared/environment-file";
import { createRedisRateLimitStore } from "@sellbridge/shared/redis-rate-limit-store";
import { Queue } from "bullmq";
import { afterAll, describe, expect, it } from "vitest";
import { createAuthRateLimitStorage, createMemoryRateLimitStore } from "./auth-rate-limit.ts";

loadRootEnvironmentFile();
function requiredRedisUrl(): string {
  const url = process.env.REDIS_URL;
  if (url === undefined || url === "") {
    throw new Error("REDIS_URL é obrigatória para o teste do limite de login");
  }
  return url;
}
const redisUrl = requiredRedisUrl();

// Each run counts in its own namespace, so real counters are never touched.
const namespace = `auth-test-${crypto.randomUUID()}`;
const SIGN_IN_RULE = { window: 900, max: 3 };
const queues: Queue[] = [];

/** A web process as it starts after a deploy: its own connection, its own empty memory. */
function startWebProcess() {
  const queue = new Queue(`auth-rate-limit-${crypto.randomUUID()}`, {
    connection: { url: redisUrl },
  });
  queues.push(queue);
  return createAuthRateLimitStorage({
    shared: createRedisRateLimitStore(queue, namespace),
    fallback: createMemoryRateLimitStore(),
    keySecret: "test-secret",
  });
}

async function attempts(
  storage: ReturnType<typeof startWebProcess>,
  key: string,
  rule: { window: number; max: number },
  count: number,
) {
  const verdicts: boolean[] = [];
  for (let attempt = 0; attempt < count; attempt += 1) {
    verdicts.push((await storage.consume(key, rule)).allowed);
  }
  return verdicts;
}

afterAll(async () => {
  const first = queues[0];
  if (first !== undefined) {
    const client = await first.getBackend().client;
    const keys = await client.runCommand("keys", [`sellbridge:rate-limit:${namespace}:*`]);
    if (Array.isArray(keys) && keys.length > 0) {
      await client.runCommand("del", keys.map(String));
    }
  }
  await Promise.all(queues.map(async (queue) => queue.close()));
});

describe("sign-in limit on a real Redis", () => {
  it("lets exactly the max through and refuses the next with the wait left", async () => {
    const web = startWebProcess();
    const key = `limit-${crypto.randomUUID()}`;

    const verdicts = await attempts(web, key, SIGN_IN_RULE, 3);
    const refused = await web.consume(key, SIGN_IN_RULE);

    expect(verdicts).toEqual([true, true, true]);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfter).toBeGreaterThan(890);
    expect(refused.retryAfter).toBeLessThanOrEqual(900);
  });

  it("keeps the count when the web app restarts", async () => {
    const key = `restart-${crypto.randomUUID()}`;
    await attempts(startWebProcess(), key, SIGN_IN_RULE, 3);

    const afterDeploy = await startWebProcess().consume(key, SIGN_IN_RULE);

    expect(afterDeploy.allowed).toBe(false);
  });

  it("counts the attempts of every running process together", async () => {
    const key = `together-${crypto.randomUUID()}`;
    const one = startWebProcess();
    const two = startWebProcess();

    const verdicts = await Promise.all(
      Array.from({ length: 8 }, async (_, index) =>
        (index % 2 === 0 ? one : two).consume(key, SIGN_IN_RULE),
      ),
    );

    expect(verdicts.filter((verdict) => verdict.allowed)).toHaveLength(SIGN_IN_RULE.max);
  });

  it("allows again once the window is over", async () => {
    const web = startWebProcess();
    const key = `window-${crypto.randomUUID()}`;
    const shortRule = { window: 1, max: 1 };
    await attempts(web, key, shortRule, 2);

    await new Promise((resolve) => setTimeout(resolve, 1_100));
    const afterWindow = await web.consume(key, shortRule);

    expect(afterWindow.allowed).toBe(true);
  });
});
