import { beforeEach, describe, expect, it, vi } from "vitest";

type MiddlewareHandler = (input: {
  next: (input: { context: { userId: string } }) => Promise<unknown>;
}) => Promise<unknown>;
const mocks = vi.hoisted(() => {
  const handlers: MiddlewareHandler[] = [];
  return {
    getSession: vi.fn<() => Promise<{ user: { id: string; role: string } } | null>>(),
    setResponseStatus: vi.fn<(status: number) => void>(),
    handlers,
  };
});
vi.mock("./auth.ts", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("./membership.ts", () => ({
  findFirstOrganizationId: vi.fn<() => Promise<string | null>>(),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeaders: () => new Headers(),
  setResponseStatus: mocks.setResponseStatus,
}));
vi.mock("@tanstack/react-start", () => ({
  createMiddleware: () => ({
    server: (handler: MiddlewareHandler) => {
      mocks.handlers.push(handler);
      return {};
    },
  }),
}));
import "./middleware";
async function runAdminMiddleware(input: Parameters<MiddlewareHandler>[0]) {
  const handler = mocks.handlers[1];
  if (!handler) {
    throw new Error("middleware admin não registrado");
  }
  return await handler(input);
}

beforeEach(() => {
  vi.clearAllMocks();
});
describe("admin middleware", () => {
  it("returns 403 for a non-admin before accessing the catalog", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "reseller", role: "user" } });
    const next = vi.fn<Parameters<MiddlewareHandler>[0]["next"]>();
    await expect(runAdminMiddleware({ next })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.setResponseStatus).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
  it("returns 401 when unauthenticated", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(
      runAdminMiddleware({ next: vi.fn<Parameters<MiddlewareHandler>[0]["next"]>() }),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(mocks.setResponseStatus).toHaveBeenCalledWith(401);
  });
  it("passes the authenticated admin id to the handler", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "administrator", role: "admin" } });
    const next = vi.fn<Parameters<MiddlewareHandler>[0]["next"]>().mockResolvedValue({ ok: true });
    await expect(runAdminMiddleware({ next })).resolves.toEqual({ ok: true });
    expect(next).toHaveBeenCalledWith({ context: { userId: "administrator" } });
  });
});
