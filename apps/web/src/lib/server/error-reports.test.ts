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

function request(body: unknown = report, origin = "https://app.example") {
  return new Request("http://internal/api/diagnostics/errors", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
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

  it("bounds ingestion even without auth or a database", async () => {
    const { handleErrorReport } = await import("./error-reports");
    for (let index = 0; index < 60; index += 1) {
      expect((await handleErrorReport(request())).status).toBe(204);
    }
    expect((await handleErrorReport(request())).status).toBe(429);
    expect(log).toHaveBeenCalledTimes(60);
  });
});
