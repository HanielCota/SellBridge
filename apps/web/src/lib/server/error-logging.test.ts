import { describe, expect, it, vi } from "vitest";

type Handler = (input: {
  next: () => Promise<unknown>;
  serverFnMeta: { name: string; id: string };
}) => Promise<unknown>;
const mocks = vi.hoisted(() => ({
  log: vi.fn<(event: string, fields: Record<string, unknown>) => void>(),
  handlers: [] as Handler[],
}));
vi.mock("@sellbridge/shared/logger", () => ({ logger: { error: mocks.log } }));
vi.mock("@tanstack/react-start", () => ({
  createMiddleware: () => ({
    server: (handler: Handler) => {
      mocks.handlers.push(handler);
      return {};
    },
  }),
}));
import { redirect } from "@tanstack/react-router";
import "./error-logging";

const meta = { name: "getAppSession", id: "function-123" };
const handler = mocks.handlers[0];
if (!handler) throw new Error("Server error middleware was not registered");

describe("server function diagnostics", () => {
  it("logs the original failure before serialization and preserves the thrown error", async () => {
    const cause = new Error("Database unavailable for alice@example.com");
    const error = new Error("Session lookup failed", { cause });
    const next = vi.fn<() => Promise<unknown>>().mockRejectedValue(error);
    await expect(handler({ next, serverFnMeta: meta })).rejects.toBe(error);
    expect(mocks.log).toHaveBeenCalledWith(
      "web.server_function_error",
      expect.objectContaining({
        functionName: "getAppSession",
        diagnostic: expect.objectContaining({ message: "Session lookup failed" }),
        cause: expect.objectContaining({ message: "Database unavailable for [email]" }),
      }),
    );
  });

  it("does not log normal redirects or successful calls", async () => {
    mocks.log.mockClear();
    const result = { result: { ok: true } };
    expect(await handler({ next: async () => result, serverFnMeta: meta })).toBe(result);
    const navigation = redirect({ href: "/login" });
    await expect(
      handler({
        next: async () => {
          throw navigation;
        },
        serverFnMeta: meta,
      }),
    ).rejects.toBe(navigation);
    expect(mocks.log).not.toHaveBeenCalled();
  });
});
