import { beforeEach, describe, expect, it, vi } from "vitest";

type Next = (input?: { context: Record<string, unknown> }) => Promise<unknown>;
type MiddlewareHandler = (input: { next: Next }) => Promise<unknown>;
interface RegisteredMiddleware {
  handler: MiddlewareHandler;
  /** Middlewares this one runs inside of, outermost first. */
  parents: RegisteredMiddleware[];
}

const mocks = vi.hoisted(() => ({
  getSession: vi.fn<() => Promise<{ user: { id: string; role: string } } | null>>(),
  setResponseStatus: vi.fn<(status: number) => void>(),
}));
vi.mock("./auth.ts", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("./membership.ts", () => ({
  findFirstOrganizationId: vi.fn<() => Promise<string | null>>(),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeaders: () => new Headers(),
  setResponseStatus: mocks.setResponseStatus,
}));
// A tiny stand-in for the builder: `.middleware([...])` records the parents, `.server()` the handler.
vi.mock("@tanstack/react-start", () => ({
  createMiddleware: () => {
    let parents: RegisteredMiddleware[] = [];
    const builder = {
      middleware: (list: RegisteredMiddleware[]) => {
        parents = list;
        return builder;
      },
      server: (handler: MiddlewareHandler): RegisteredMiddleware => ({ handler, parents }),
    };
    return builder;
  },
}));

const { adminMiddleware, staffMiddleware } = await import("./middleware");

function isRegistered(value: unknown): value is RegisteredMiddleware {
  return typeof value === "object" && value !== null && "handler" in value && "parents" in value;
}

/** Runs a middleware the way the framework does: each parent wraps the next step. */
async function run(middleware: unknown, next: Next): Promise<unknown> {
  if (!isRegistered(middleware)) {
    throw new Error("middleware não registrado");
  }
  const chain = [...middleware.parents, middleware];
  const step = async (index: number): Promise<unknown> => {
    const current = chain[index];
    if (!current) {
      throw new Error("middleware ausente");
    }
    if (index === chain.length - 1) {
      return current.handler({ next });
    }
    return current.handler({ next: async () => step(index + 1) });
  };
  return step(0);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin middleware", () => {
  it("returns 403 for a non-admin before accessing the catalog", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "reseller", role: "user" } });
    const next = vi.fn<Next>();
    await expect(run(adminMiddleware, next)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.setResponseStatus).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(run(adminMiddleware, vi.fn<Next>())).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(mocks.setResponseStatus).toHaveBeenCalledWith(401);
  });

  it("passes the authenticated admin id to the handler", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "administrator", role: "admin" } });
    const next = vi.fn<Next>().mockResolvedValue({ ok: true });
    await expect(run(adminMiddleware, next)).resolves.toEqual({ ok: true });
    expect(next).toHaveBeenCalledWith({ context: { userId: "administrator" } });
  });
});

describe("staff middleware", () => {
  it("returns 403 to an agent asking for supervisor work", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "agent", role: "agent" } });
    const next = vi.fn<Next>();
    await expect(run(staffMiddleware("support.metrics"), next)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.setResponseStatus).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("passes the agent id and role when the permission matches", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "agent", role: "agent" } });
    const next = vi.fn<Next>().mockResolvedValue({ ok: true });
    await expect(run(staffMiddleware("support.answer"), next)).resolves.toEqual({ ok: true });
    expect(next).toHaveBeenCalledWith({ context: { userId: "agent", role: "agent" } });
  });
});
