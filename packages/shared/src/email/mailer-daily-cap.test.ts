import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../runtime/errors.ts";

const logs = vi.hoisted(() => ({
  info: vi.fn<(event: string, fields: Record<string, unknown>) => void>(),
  warn: vi.fn<(event: string, fields: Record<string, unknown>) => void>(),
  error: vi.fn<(event: string, fields: Record<string, unknown>) => void>(),
}));
vi.mock("../runtime/logger.ts", () => ({ logger: logs }));
import { createEmailQuota, type EmailQuotaLimits, type EmailQuotaStore } from "./email-quota.ts";
import { createMemoryEmailQuotaStore } from "./email-quota-testing.ts";
import { createMailer, emailDailyCapResetsAt, type OutgoingEmail } from "./mailer.ts";

const email: OutgoingEmail = {
  to: "fornecedor@exemplo.com.br",
  subject: "Novo pedido",
  text: "Olá",
};
const from = "SellBridge <no-reply@sellbridge.local>";
const limits: EmailQuotaLimits = {
  accountDaily: 2,
  accountPerRecipientDaily: 2,
  generalDaily: 3,
  generalPerRecipientDaily: 2,
};
// 20/11/2026 15:00 in Sao Paulo.
const afternoon = new Date("2026-11-20T18:00:00Z");

beforeEach(() => {
  logs.info.mockReset();
  logs.warn.mockReset();
  logs.error.mockReset();
});

function setup(overrides: Partial<EmailQuotaLimits> = {}, store = createMemoryEmailQuotaStore()) {
  const clock = { now: afternoon };
  const fetcher = vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 }));
  const quota = createEmailQuota({
    store,
    limits: { ...limits, ...overrides },
    now: () => clock.now,
  });
  const send = createMailer({ apiKey: "re_test", from, production: true, quota, fetch: fetcher });
  return { clock, fetcher, send, store };
}

function to(name: string): OutgoingEmail {
  return { ...email, to: `${name}@exemplo.com.br` };
}

async function outcomeOf(send: Promise<void>): Promise<"sent" | "refused"> {
  try {
    await send;
    return "sent";
  } catch {
    return "refused";
  }
}

async function sendAll(
  send: (email: OutgoingEmail) => Promise<void>,
  emails: readonly OutgoingEmail[],
) {
  const outcomes: string[] = [];
  for (const item of emails) {
    outcomes.push(await outcomeOf(send(item)));
  }
  return outcomes;
}

async function failure(send: Promise<void>): Promise<AppError> {
  try {
    await send;
  } catch (error) {
    if (error instanceof AppError) return error;
  }
  throw new Error("expected an AppError");
}

function eventsLogged(log: typeof logs.error, event: string) {
  return log.mock.calls.filter(([name]) => name === event);
}

describe("createMailer daily allowance", () => {
  it("sends only the daily allowance of the whole system", async () => {
    const { fetcher, send } = setup();

    const outcomes = await sendAll(send, [to("a"), to("b"), to("c"), to("d"), to("e")]);

    expect(outcomes).toEqual(["sent", "sent", "sent", "refused", "refused"]);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("sends only the daily allowance of one recipient, and still serves the others", async () => {
    const { fetcher, send } = setup();

    const outcomes = await sendAll(send, [to("a"), to("A"), to(" a"), to("b")]);

    expect(outcomes).toEqual(["sent", "sent", "refused", "sent"]);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("refuses with the time the allowance is whole again", async () => {
    const { send } = setup({ generalDaily: 0 });

    const error = await failure(send(email));

    expect(error.code).toBe("RATE_LIMITED");
    expect(emailDailyCapResetsAt(error)).toEqual(new Date("2026-11-21T03:00:00Z"));
  });

  it("tells the team once a day, without the recipient", async () => {
    const { send } = setup();

    await sendAll(send, [to("a"), to("b"), to("c"), to("d"), to("e"), to("f")]);

    const alerts = eventsLogged(logs.error, "email.daily_cap_reached");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.[1]).toMatchObject({ category: "general", scope: "system" });
    expect(eventsLogged(logs.warn, "email.daily_cap_blocked")).toHaveLength(3);
    const logged = JSON.stringify([logs.error.mock.calls, logs.warn.mock.calls]);
    expect(logged).not.toContain("exemplo.com.br");
  });

  it("sends again when the day turns in Sao Paulo", async () => {
    const { clock, fetcher, send } = setup({ generalDaily: 1 });
    await sendAll(send, [to("a"), to("b")]);

    clock.now = new Date("2026-11-21T02:59:00Z");
    const beforeMidnight = await sendAll(send, [to("c")]);
    clock.now = new Date("2026-11-21T03:00:00Z");
    const afterMidnight = await sendAll(send, [to("c")]);

    expect(beforeMidnight).toEqual(["refused"]);
    expect(afterMidnight).toEqual(["sent"]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("keeps account e-mails going when notices used up their allowance", async () => {
    const { send } = setup();
    await sendAll(send, [to("a"), to("b"), to("c"), to("d")]);

    const outcomes = await sendAll(send, [{ ...to("a"), category: "account" }]);

    expect(outcomes).toEqual(["sent"]);
  });

  it("holds account e-mails to their own allowance", async () => {
    const { send } = setup();
    const reset: OutgoingEmail = { ...email, category: "account" };

    const outcomes = await sendAll(send, [reset, reset, reset]);

    expect(outcomes).toEqual(["sent", "sent", "refused"]);
  });

  it("adds up the web app and the worker on the same counters", async () => {
    const web = setup();
    const worker = setup({}, web.store);

    const fromWeb = await sendAll(web.send, [to("a"), to("b")]);
    const fromWorker = await sendAll(worker.send, [to("c"), to("d")]);

    expect([...fromWeb, ...fromWorker]).toEqual(["sent", "sent", "sent", "refused"]);
    expect(eventsLogged(logs.error, "email.daily_cap_reached")).toHaveLength(1);
  });
});

describe("createMailer when the counters cannot be read", () => {
  const brokenStore: EmailQuotaStore = {
    reserve: async () => {
      throw new Error("redis down");
    },
    claimOnce: async () => false,
  };

  it("holds a notice, as worth retrying", async () => {
    const { fetcher, send } = setup({}, brokenStore);

    const error = await failure(send(email));

    expect(error.details).toMatchObject({ retryable: true });
    expect(emailDailyCapResetsAt(error)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("still sends an account e-mail", async () => {
    const { fetcher, send } = setup({}, brokenStore);

    await send({ ...email, category: "account" });

    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
