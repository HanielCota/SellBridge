import { beforeEach, describe, expect, it, vi } from "vitest";

type Next = (input?: { context: Record<string, unknown> }) => Promise<unknown>;
/** What the framework hands every middleware besides `next`. */
interface CallInfo {
  method?: string;
  data?: unknown;
  serverFnMeta?: { name: string };
}
type MiddlewareHandler = (input: { next: Next } & CallInfo) => Promise<unknown>;
interface RegisteredMiddleware {
  handler: MiddlewareHandler;
  /** Middlewares this one runs inside of, outermost first. */
  parents: RegisteredMiddleware[];
}

const mocks = vi.hoisted(() => ({
  getSession: vi.fn<() => Promise<unknown>>(),
  setResponseStatus: vi.fn<(status: number) => void>(),
  recordAdminEvent: vi.fn<(database: unknown, input: unknown) => Promise<void>>(),
  requestUrl: { current: "http://localhost/_serverFn/abc" },
  /** The supplier run by the supplier profile org-3. */
  supplierId: "4f1c7a52-8f0e-4d3b-9a51-2f6b8c0d1e23",
}));
vi.mock("./database.ts", () => ({ database: {} }));
vi.mock("@sellbridge/database/repositories", () => ({
  recordAdminEvent: mocks.recordAdminEvent,
  findSupplierOfProfile: async (_database: unknown, organizationId: string) =>
    organizationId === "org-3" ? { id: mocks.supplierId } : null,
}));
vi.mock("./auth.ts", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("./membership.ts", () => ({
  listMemberships: async () => [
    { organizationId: "org-1", slug: "loja-1", kind: "seller" },
    { organizationId: "org-2", slug: "loja-2", kind: "seller" },
    { organizationId: "org-3", slug: "fornecedor-3", kind: "supplier" },
  ],
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeaders: () => new Headers(),
  getRequest: () => new Request(mocks.requestUrl.current),
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

const {
  accountMiddleware,
  adminMiddleware,
  staffMiddleware,
  supplierPanelMiddleware,
  tenantMiddleware,
} = await import("./middleware");

function isRegistered(value: unknown): value is RegisteredMiddleware {
  return typeof value === "object" && value !== null && "handler" in value && "parents" in value;
}

/** Runs a middleware the way the framework does: each parent wraps the next step. */
async function run(middleware: unknown, next: Next, call: CallInfo = {}): Promise<unknown> {
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
      return current.handler({ next, ...call });
    }
    return current.handler({ next: async () => step(index + 1), ...call });
  };
  return step(0);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requestUrl.current = "http://localhost/_serverFn/abc";
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

  it("passes the authenticated admin id and identity to the handler", async () => {
    const admin = { email: "admin@sellbridge.test", emailVerified: true, role: "admin" };
    mocks.getSession.mockResolvedValue({ user: { id: "administrator", ...admin } });
    const next = vi.fn<Next>().mockResolvedValue({ ok: true });
    await expect(run(adminMiddleware, next)).resolves.toEqual({ ok: true });
    expect(next).toHaveBeenCalledWith({ context: { userId: "administrator", actor: admin } });
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

  it("refuses review comments to an agent and opens them to a supervisor", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "agent", role: "agent" } });
    const refused = vi.fn<Next>();
    await expect(run(staffMiddleware("reviews.moderate"), refused)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(refused).not.toHaveBeenCalled();

    mocks.getSession.mockResolvedValue({ user: { id: "lead", role: "supervisor" } });
    const allowed = vi.fn<Next>().mockResolvedValue({ ok: true });
    await expect(run(staffMiddleware("reviews.moderate"), allowed)).resolves.toEqual({ ok: true });
  });
});

const post = (name: string): CallInfo => ({ method: "POST", serverFnMeta: { name } });
const read = (name: string): CallInfo => ({ method: "GET", serverFnMeta: { name } });

describe("tenant middleware inside a customer's account", () => {
  const impersonated = {
    user: { id: "customer-1", role: "user" },
    session: { activeOrganizationId: "org-1", impersonatedBy: "admin-1", createdAt: new Date() },
  };
  const own = { ...impersonated, session: { ...impersonated.session, impersonatedBy: null } };

  it("refuses a blocked action before it runs", async () => {
    mocks.getSession.mockResolvedValue(impersonated);
    const next = vi.fn<Next>();
    await expect(run(tenantMiddleware, next, post("disconnectStoreFn"))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.setResponseStatus).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("records the admin behind a write made as the customer, once it went through", async () => {
    mocks.getSession.mockResolvedValue(impersonated);
    const next = vi.fn<Next>().mockResolvedValue({ ok: true });
    await expect(run(tenantMiddleware, next, post("forwardOrderFn"))).resolves.toEqual({
      ok: true,
    });
    expect(mocks.recordAdminEvent).toHaveBeenCalledWith(
      {},
      {
        adminId: "admin-1",
        userId: "customer-1",
        action: "acted_as_customer",
        details: { action: "forwardOrderFn" },
      },
    );
  });

  it("records nothing for reads, failed writes or the customer's own session", async () => {
    mocks.getSession.mockResolvedValue(impersonated);
    await run(tenantMiddleware, vi.fn<Next>().mockResolvedValue({}), {
      method: "GET",
      serverFnMeta: { name: "getOrderPageFn" },
    });
    await expect(
      run(
        tenantMiddleware,
        vi.fn<Next>().mockRejectedValue(new Error("falhou")),
        post("forwardOrderFn"),
      ),
    ).rejects.toBeDefined();
    mocks.getSession.mockResolvedValue(own);
    await run(tenantMiddleware, vi.fn<Next>().mockResolvedValue({}), post("disconnectStoreFn"));
    expect(mocks.recordAdminEvent).not.toHaveBeenCalled();
  });
});

describe("tenant middleware profile", () => {
  const reseller = {
    user: { id: "customer-1", role: "user" },
    session: { activeOrganizationId: "org-1", impersonatedBy: null, createdAt: new Date() },
  };

  it("uses the profile in the page URL when the call carries no header (server render)", async () => {
    mocks.getSession.mockResolvedValue(reseller);
    mocks.requestUrl.current = "http://localhost/pedidos?perfil=loja-2";
    const next = vi.fn<Next>().mockResolvedValue({ ok: true });
    await run(tenantMiddleware, next, { method: "GET", serverFnMeta: { name: "listOrdersFn" } });
    expect(next).toHaveBeenCalledWith({ context: expect.objectContaining({ tenantId: "org-2" }) });
  });

  it("refuses a page URL naming a profile outside the account", async () => {
    mocks.getSession.mockResolvedValue(reseller);
    mocks.requestUrl.current = "http://localhost/pedidos?perfil=loja-de-outra-pessoa";
    const next = vi.fn<Next>();
    await expect(
      run(tenantMiddleware, next, { method: "GET", serverFnMeta: { name: "listOrdersFn" } }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(next).not.toHaveBeenCalled();
  });
});

describe("profile kind of the tab's profile", () => {
  const onSeller = {
    user: { id: "customer-1", role: "user" },
    session: { activeOrganizationId: "org-1", impersonatedBy: null, createdAt: new Date() },
  };
  const onSupplier = {
    ...onSeller,
    session: { ...onSeller.session, activeOrganizationId: "org-3" },
  };

  it("refuses a seller function from a tab on a supplier profile, whatever the session's", async () => {
    mocks.getSession.mockResolvedValue(onSeller);
    mocks.requestUrl.current = "http://localhost/pedidos?perfil=fornecedor-3";
    const next = vi.fn<Next>();
    await expect(run(tenantMiddleware, next, read("listOrdersFn"))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.setResponseStatus).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("serves a seller function from a tab on a seller profile while the session is a supplier", async () => {
    mocks.getSession.mockResolvedValue(onSupplier);
    mocks.requestUrl.current = "http://localhost/pedidos?perfil=loja-2";
    const next = vi.fn<Next>().mockResolvedValue({ ok: true });
    await run(tenantMiddleware, next, read("listOrdersFn"));
    expect(next).toHaveBeenCalledWith({
      context: expect.objectContaining({ tenantId: "org-2", profileKind: "seller" }),
    });
  });

  it("opens account functions to the tab's supplier profile", async () => {
    mocks.getSession.mockResolvedValue(onSeller);
    mocks.requestUrl.current = "http://localhost/suporte?perfil=fornecedor-3";
    const next = vi.fn<Next>().mockResolvedValue({ ok: true });
    await run(accountMiddleware, next, read("listTicketsFn"));
    expect(next).toHaveBeenCalledWith({
      context: expect.objectContaining({ tenantId: "org-3", profileKind: "supplier" }),
    });
  });

  it("checks the supplier panel against the tab's profile, not the session's", async () => {
    const panelCall = { ...read("getPanelHomeFn"), data: { supplierId: mocks.supplierId } };
    mocks.getSession.mockResolvedValue(onSeller);
    mocks.requestUrl.current = "http://localhost/fornecedor/painel?perfil=fornecedor-3";
    const allowed = vi.fn<Next>().mockResolvedValue({ ok: true });
    await run(supplierPanelMiddleware, allowed, panelCall);
    expect(allowed).toHaveBeenCalledOnce();

    mocks.getSession.mockResolvedValue(onSupplier);
    mocks.requestUrl.current = "http://localhost/fornecedor/painel?perfil=loja-1";
    const refused = vi.fn<Next>();
    await expect(run(supplierPanelMiddleware, refused, panelCall)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(refused).not.toHaveBeenCalled();
  });
});
