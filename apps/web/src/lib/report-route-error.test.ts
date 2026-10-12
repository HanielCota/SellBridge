import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const transport = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("fetch", transport);
  transport.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("route error delivery", () => {
  it("coalesces concurrent renders and reports without sending credentials", async () => {
    transport.mockResolvedValue(new Response(null, { status: 204 }));
    const { reportRouteError } = await import("./report-route-error");
    const error = new Error("Failed to fetch https://app.example/api?token=secret");
    const ids = await Promise.all([
      reportRouteError(error, "/_app/pedidos/$orderId"),
      reportRouteError(error, "/_app/pedidos/$orderId"),
    ]);
    expect(ids[0]).toBeTruthy();
    expect(ids[0]).toBe(ids[1]);
    expect(await reportRouteError(error, "/_app/pedidos/$orderId")).toBe(ids[0]);
    expect(transport).toHaveBeenCalledOnce();
    const call = transport.mock.calls[0];
    if (!call) throw new Error("Report was not sent");
    const [url, options] = call;
    expect(url).toBe("/api/diagnostics/errors");
    expect(options).toMatchObject({ method: "POST", credentials: "omit", keepalive: true });
    expect(options?.body).toEqual(expect.any(String));
    expect(options?.body).not.toContain("secret");
  });

  it("does not throw or claim delivery when the receiver fails", async () => {
    const { reportRouteError } = await import("./report-route-error");
    transport.mockRejectedValueOnce(new Error("Offline"));
    expect(await reportRouteError(new Error("Failed"), "/_app")).toBeNull();
    transport.mockResolvedValueOnce(new Response(null, { status: 429 }));
    expect(await reportRouteError(new Error("Failed"), "/_app")).toBeNull();
  });

  it("caps distinct reports to avoid a failure loop flooding the receiver", async () => {
    transport.mockResolvedValue(new Response(null, { status: 204 }));
    const { reportRouteError } = await import("./report-route-error");
    for (let index = 0; index < 10; index += 1) {
      expect(await reportRouteError(new Error(`Failure ${index}`), "/_app")).toBeTruthy();
    }
    expect(await reportRouteError(new Error("Another failure"), "/_app")).toBeNull();
    expect(transport).toHaveBeenCalledTimes(10);
  });
});
