import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { log } = vi.hoisted(() => ({
  log: vi.fn<(event: string, fields: Record<string, unknown>) => void>(),
}));
vi.mock("@sellbridge/shared/logger", () => ({ logger: { error: log } }));
const report = {
  id: "7a43cf86-6686-4b2b-a681-a51993ced5c0",
  occurredAt: "2026-10-12T22:00:00.000Z",
  route: "/_app/pedidos/$orderId",
  buildId: "build-abc",
  name: "TypeError",
  message: "Cannot read properties of undefined",
  frames: ["/assets/page-abc.js:15:9"],
};

function request(body: unknown = report, origin = "https://app.example", ip = "203.0.113.7") {
  return new Request("http://internal/api/diagnostics/errors", {
    method: "POST",
    headers: { origin, "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("APP_URL", "https://app.example");
  log.mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("diagnostic receiver", () => {
  // Regression: APP_URL was read raw, so a malformed value made `new URL` throw and the receiver
  // answered 500 — and it exists to report exactly that kind of broken configuration.
  it("falls back to BETTER_AUTH_URL when APP_URL is malformed", async () => {
    vi.stubEnv("APP_URL", "not a url");
    vi.stubEnv("BETTER_AUTH_URL", "https://app.example");
    const { handleErrorReport } = await import("./error-reports");
    expect((await handleErrorReport(request())).status).toBe(204);
  });

  it("logs an accepted report with its reference and browser/server builds", async () => {
    const { handleErrorReport } = await import("./error-reports");
    const response = await handleErrorReport(
      request({ ...report, message: "Failure for alice@example.com token=secret" }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(log).toHaveBeenCalledWith(
      "web.route_error",
      expect.objectContaining({
        id: report.id,
        route: report.route,
        source: "browser",
        serverBuildId: expect.any(String),
      }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/alice@example.com|secret/);
  });

  it("rejects cross-origin, non-JSON, invalid and oversized reports without logging", async () => {
    const { handleErrorReport } = await import("./error-reports");
    expect((await handleErrorReport(request(report, "https://other.example"))).status).toBe(403);
    const wrongType = request();
    wrongType.headers.set("content-type", "text/plain");
    expect((await handleErrorReport(wrongType)).status).toBe(415);
    expect((await handleErrorReport(request({ ...report, cookies: "secret" }))).status).toBe(400);
    expect(
      (await handleErrorReport(request({ ...report, route: "/pedidos?token=secret" }))).status,
    ).toBe(400);
    expect(
      (await handleErrorReport(request({ ...report, message: "x".repeat(9000) }))).status,
    ).toBe(413);
    expect(log).not.toHaveBeenCalled();
  });

  it("bounds each client even without auth or a database", async () => {
    const { handleErrorReport } = await import("./error-reports");
    for (let index = 0; index < 30; index += 1) {
      expect((await handleErrorReport(request())).status).toBe(204);
    }
    expect((await handleErrorReport(request())).status).toBe(429);
    expect(log).toHaveBeenCalledTimes(30);
  });

  it("keeps listening to other clients when one spends its budget", async () => {
    const { handleErrorReport } = await import("./error-reports");
    for (let index = 0; index < 61; index += 1) {
      await handleErrorReport(request(report, "https://app.example", "198.51.100.1"));
    }
    const other = await handleErrorReport(request(report, "https://app.example", "198.51.100.2"));
    expect(other.status).toBe(204);
  });

  it("still caps the total, whatever the addresses claim", async () => {
    const { handleErrorReport } = await import("./error-reports");
    const statuses: number[] = [];
    for (let index = 0; index < 601; index += 1) {
      const ip = `198.51.100.${index % 250}`;
      statuses.push((await handleErrorReport(request(report, "https://app.example", ip))).status);
    }
    expect(statuses.filter((status) => status === 204)).toHaveLength(600);
    expect(statuses.at(-1)).toBe(429);
  });
});
