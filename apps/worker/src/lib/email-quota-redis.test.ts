import { createEmailQuota, type EmailQuotaLimits } from "@sellbridge/shared/email-quota";
import { loadRootEnvironmentFile } from "@sellbridge/shared/environment-file";
import { createRedisEmailQuotaStore } from "@sellbridge/shared/redis-email-quota-store";
import { Queue } from "bullmq";
import { afterAll, describe, expect, it } from "vitest";

loadRootEnvironmentFile();
const redisUrl = process.env.REDIS_URL;
if (redisUrl === undefined || redisUrl === "") {
  throw new Error("REDIS_URL é obrigatória para o teste do contador de e-mails");
}

// Each run counts on its own day, far from today, so real counters are never touched.
const runDay = new Date(Date.UTC(1990, 0, 1 + Math.floor(Math.random() * 3000), 12));
const runDayKeys = `sellbridge:email-quota:${runDay.toISOString().slice(0, 10)}:*`;
const limits: EmailQuotaLimits = {
  accountDaily: 5,
  accountPerRecipientDaily: 1,
  generalDaily: 5,
  generalPerRecipientDaily: 2,
};
const webQueue = new Queue(`email-quota-web-${crypto.randomUUID()}`, {
  connection: { url: redisUrl },
});
const workerQueue = new Queue(`email-quota-worker-${crypto.randomUUID()}`, {
  connection: { url: redisUrl },
});

function quotaOn(queue: Queue) {
  return createEmailQuota({
    store: createRedisEmailQuotaStore(queue),
    limits,
    recipientKeySecret: "test-secret",
    now: () => runDay,
  });
}
const web = quotaOn(webQueue);
const worker = quotaOn(workerQueue);

afterAll(async () => {
  const client = await webQueue.getBackend().client;
  const keys = await client.runCommand("keys", [runDayKeys]);
  if (Array.isArray(keys) && keys.length > 0) {
    await client.runCommand("del", keys.map(String));
  }
  await webQueue.close();
  await workerQueue.close();
});

describe("e-mail allowance on a real Redis", () => {
  it("lets exactly the allowance through when two processes ask at once", async () => {
    const requests = Array.from({ length: 20 }, async (_, index) =>
      (index % 2 === 0 ? web : worker).reserve({
        to: `pessoa-${index}@sellbridge.test`,
        category: "general",
      }),
    );

    const verdicts = await Promise.all(requests);

    expect(verdicts.filter((verdict) => verdict.allowed)).toHaveLength(limits.generalDaily);
    const alerts = verdicts.filter((verdict) => !verdict.allowed && verdict.firstToday);
    expect(alerts).toHaveLength(1);
  });

  it("holds one address to its allowance across processes, each account kind apart", async () => {
    const to = "dona@sellbridge.test";

    const firstSignUp = await web.reserve({ to, category: "account_sign_up" });
    const secondSignUp = await worker.reserve({
      to: " Dona@sellbridge.test",
      category: "account_sign_up",
    });
    const reset = await worker.reserve({ to, category: "account_access" });

    expect([firstSignUp.allowed, secondSignUp.allowed, reset.allowed]).toEqual([true, false, true]);
  });
});
