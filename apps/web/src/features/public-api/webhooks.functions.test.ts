import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWebhookEndpointInputSchema } from "./webhooks";

type Handler = (input: { context: { tenantId: string; userId: string }; data: unknown }) => unknown;

const mocks = vi.hoisted(() => ({
  /** Each server function's handler with the validator it was built with. */
  serverFunctions: [] as { validator: unknown; handler: Handler }[],
  isUserEmailVerified: vi.fn<(database: unknown, userId: string) => Promise<boolean>>(),
  createOrganizationWebhookEndpoint: vi.fn<(input: unknown) => Promise<unknown>>(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validator: unknown = null;
    const builder = {
      middleware: () => builder,
      validator: (schema: unknown) => {
        validator = schema;
        return builder;
      },
      handler: (handler: Handler) => {
        mocks.serverFunctions.push({ validator, handler });
        return builder;
      },
    };
    return builder;
  },
}));
vi.mock("@/lib/server/middleware", () => ({ tenantMiddleware: {} }));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@sellbridge/database/repositories", () => ({
  isUserEmailVerified: mocks.isUserEmailVerified,
}));
vi.mock("./webhooks.server", () => ({
  createOrganizationWebhookEndpoint: mocks.createOrganizationWebhookEndpoint,
  deleteOrganizationWebhookEndpoint: vi.fn<() => Promise<void>>(),
  listOrganizationWebhookEndpoints: vi.fn<() => Promise<unknown[]>>(),
  setOrganizationWebhookEndpointEnabled: vi.fn<() => Promise<unknown>>(),
}));

await import("./webhooks.functions");

/** `createWebhookEndpointFn`, found by the input schema only it validates. */
function createEndpoint() {
  const serverFunction = mocks.serverFunctions.find(
    (candidate) => candidate.validator === createWebhookEndpointInputSchema,
  );
  if (serverFunction === undefined) {
    throw new Error("No server function validates createWebhookEndpointInputSchema");
  }

  return serverFunction.handler({
    context: { tenantId: "tenant-a", userId: "user-1" },
    data: { url: "https://erp.example.com/hooks", eventTypes: ["order.created"] },
  });
}

beforeEach(() => {
  mocks.isUserEmailVerified.mockReset();
  mocks.createOrganizationWebhookEndpoint.mockReset();
  mocks.createOrganizationWebhookEndpoint.mockResolvedValue({ id: "endpoint-1" });
});

describe("createWebhookEndpointFn", () => {
  // Regression (security audit, 26/10/2026): an account signed up with someone else's address
  // could register a webhook before confirming it, and the endpoint outlived the password reset.
  it("refuses an endpoint to an account whose e-mail is not confirmed", async () => {
    mocks.isUserEmailVerified.mockResolvedValue(false);

    const creation = createEndpoint();

    await expect(creation).rejects.toMatchObject({
      code: "FORBIDDEN",
      userMessage: "Confirme seu e-mail antes de cadastrar webhooks.",
    });
    expect(mocks.createOrganizationWebhookEndpoint).not.toHaveBeenCalled();
  });

  it("creates the endpoint for an account with a confirmed e-mail", async () => {
    mocks.isUserEmailVerified.mockResolvedValue(true);

    const created = await createEndpoint();

    expect(created).toEqual({ id: "endpoint-1" });
    expect(mocks.isUserEmailVerified).toHaveBeenCalledWith(expect.anything(), "user-1");
  });
});
