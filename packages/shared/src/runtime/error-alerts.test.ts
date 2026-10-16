import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installErrorAlerts } from "./error-alerts.ts";
import { logger } from "./logger.ts";

const WEBHOOK_URL = "https://alerts.example.test/hook";

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

let uninstall: () => void = () => undefined;

function okFetch(): FetchMock {
  return vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
}

/** The JSON body of the n-th call to the mocked fetch. */
function sentBody(fetchMock: FetchMock, call = 0): { text: string; content: string } {
  const init = fetchMock.mock.calls[call]?.[1];
  if (init === undefined || typeof init.body !== "string") {
    throw new Error("nenhum alerta enviado");
  }
  return JSON.parse(init.body);
}

/** Lets the fire-and-forget delivery settle. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
  uninstall();
  uninstall = () => undefined;
  vi.restoreAllMocks();
});

describe("error alerts", () => {
  it("stays off without a webhook URL", async () => {
    const fetchMock = okFetch();
    uninstall = installErrorAlerts({ webhookUrl: undefined, service: "web", fetch: fetchMock });
    logger.error("order.save_failed", { orderId: "o-1" });
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts each error with the service and event, without personal data", async () => {
    const fetchMock = okFetch();
    uninstall = installErrorAlerts({
      webhookUrl: WEBHOOK_URL,
      service: "worker",
      fetch: fetchMock,
    });
    logger.error("order.save_failed", {
      orderId: "o-1",
      email: "maria@example.com",
      accessToken: "secret-token",
    });
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(WEBHOOK_URL);
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    const body = sentBody(fetchMock);
    expect(body.text).toContain("[SellBridge worker]");
    expect(body.text).toContain("order.save_failed");
    expect(body.text).toContain("o-1");
    expect(body.content).toBe(body.text);
    expect(body.text).not.toContain("maria@example.com");
    expect(body.text).not.toContain("secret-token");
  });

  it("ignores warnings and info", async () => {
    const fetchMock = okFetch();
    uninstall = installErrorAlerts({ webhookUrl: WEBHOOK_URL, service: "web", fetch: fetchMock });
    logger.warn("job.failed", {});
    logger.info("worker.started", {});
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the same event once per cooldown and counts the repeats", async () => {
    const fetchMock = okFetch();
    let now = 1_000_000;
    uninstall = installErrorAlerts({
      webhookUrl: WEBHOOK_URL,
      service: "web",
      fetch: fetchMock,
      now: () => now,
      cooldownMilliseconds: 60_000,
    });
    logger.error("health.database_unreachable", {});
    logger.error("health.database_unreachable", {});
    logger.error("health.database_unreachable", {});
    logger.error("other.failure", {});
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    now += 60_000;
    logger.error("health.database_unreachable", {});
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sentBody(fetchMock, 2).text).toContain("2 repetições");
  });

  it("keeps a long error short enough for chat webhooks", async () => {
    const fetchMock = okFetch();
    uninstall = installErrorAlerts({ webhookUrl: WEBHOOK_URL, service: "web", fetch: fetchMock });
    logger.error("big.failure", { detail: "x".repeat(10_000) });
    await flush();
    expect(sentBody(fetchMock).text.length).toBeLessThanOrEqual(1900);
  });

  it("logs a warning, never an error, when the webhook fails", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new Error("network down");
    });
    const warn = vi.spyOn(logger, "warn");
    uninstall = installErrorAlerts({ webhookUrl: WEBHOOK_URL, service: "web", fetch: fetchMock });
    expect(() => logger.error("order.save_failed", {})).not.toThrow();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("alerts.delivery_failed", expect.any(Object));
  });

  it("counts an answer other than 2xx as a failure", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("no", { status: 500 }));
    const warn = vi.spyOn(logger, "warn");
    uninstall = installErrorAlerts({ webhookUrl: WEBHOOK_URL, service: "web", fetch: fetchMock });
    logger.error("order.save_failed", {});
    await flush();
    expect(warn).toHaveBeenCalledWith(
      "alerts.delivery_failed",
      expect.objectContaining({ status: 500 }),
    );
  });
});
