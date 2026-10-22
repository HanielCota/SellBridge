import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("./database.ts", () => ({ database: {} }));
vi.mock("@sellbridge/database/repositories", () => ({
  recordAdminEvent: vi.fn<() => Promise<void>>(),
}));

const {
  assertAllowedWhileImpersonating,
  assertVisitKeepsOrdersEmail,
  BLOCKED_WHILE_IMPERSONATING,
  isRecordedImpersonatedCall,
  QUIET_WHILE_IMPERSONATING,
} = await import("./impersonation");
type ImpersonatedCall = import("./impersonation").ImpersonatedCall;
const { IMPERSONATED_ACTION_COPY } = await import("@/features/admin/admin-actions");

const FEATURES = fileURLToPath(new URL("../../features", import.meta.url));

/** Every `export const name = createServerFn(` in the app's feature folders. */
function exportedServerFunctions(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return exportedServerFunctions(path);
    }
    const source = readFileSync(path, "utf8");
    return [...source.matchAll(/export const (\w+) = createServerFn\(/g)].flatMap((match) =>
      match[1] === undefined ? [] : [match[1]],
    );
  });
}

// Item 26.a (L4): accepting the terms is the customer's own act.
describe("terms acceptance during a visit", () => {
  it("refuses accepting the terms in the customer's name", () => {
    expect(() => assertAllowedWhileImpersonating(asAdmin("acceptTermsFn"))).toThrow(
      "aceitar os termos de uso",
    );
  });
});

const asAdmin = (functionName: string, method = "POST"): ImpersonatedCall => ({
  impersonatedBy: "admin-1",
  customerId: "customer-1",
  functionName,
  method,
});
const asCustomer = (functionName: string): ImpersonatedCall => ({
  ...asAdmin(functionName),
  impersonatedBy: null,
});

function refusal(call: ImpersonatedCall): unknown {
  try {
    assertAllowedWhileImpersonating(call);
    return null;
  } catch (error) {
    return error;
  }
}

describe("what an admin may do inside a customer's account", () => {
  const blocked = [
    "createApiKeyFn",
    "revokeApiKeyFn",
    "createWebhookEndpointFn",
    "deleteWebhookEndpointFn",
    "setWebhookEndpointEnabledFn",
    "disconnectStoreFn",
    "checkoutBilling",
    "manageBilling",
    "saveOnboardingHolder",
    // The supplier's company data and the e-mail that receives its orders.
    "updateOwnBrandFn",
    // The customer's rating of the support the visiting agent gave.
    "rateMyTicket",
  ];

  it.each(blocked)("refuses %s with a sentence that says why", (name) => {
    expect(refusal(asAdmin(name))).toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringContaining("durante o acesso como cliente"),
    });
  });

  it.each(blocked)("lets the customer run %s in their own session", (name) => {
    expect(refusal(asCustomer(name))).toBeNull();
  });

  it("lets the admin run the day-to-day work and reads", () => {
    expect(refusal(asAdmin("forwardOrderFn"))).toBeNull();
    // Fixing a supplier's catalog is what the visit is for.
    expect(refusal(asAdmin("supplierPanelSaveDraft"))).toBeNull();
    expect(refusal(asAdmin("updateListingPriceFn"))).toBeNull();
    expect(refusal(asAdmin("listStoreConnectionsFn", "GET"))).toBeNull();
  });

  it("names only server functions that exist, so a rename cannot reopen a block", () => {
    const exported = new Set(exportedServerFunctions(FEATURES));
    const listed = [
      ...Object.keys(BLOCKED_WHILE_IMPERSONATING),
      ...QUIET_WHILE_IMPERSONATING,
      ...Object.keys(IMPERSONATED_ACTION_COPY),
    ];
    expect(listed.length).toBeGreaterThan(0);
    // "area.action" names come from routes outside the server functions (support, profile).
    const serverFunctions = listed.filter((name) => !name.includes("."));
    expect(serverFunctions.filter((name) => !exported.has(name))).toEqual([]);
  });
});

describe("what lands in the customer's timeline", () => {
  it("records an admin's write made as the customer", () => {
    expect(isRecordedImpersonatedCall(asAdmin("forwardOrderFn"))).toBe(true);
  });

  it("leaves out reads, read markers and the customer's own actions", () => {
    expect(isRecordedImpersonatedCall(asAdmin("getOrderPageFn", "GET"))).toBe(false);
    expect(isRecordedImpersonatedCall(asAdmin("markNotificationsSeenFn"))).toBe(false);
    expect(isRecordedImpersonatedCall(asAdmin("markMyTicketRead"))).toBe(false);
    expect(isRecordedImpersonatedCall(asCustomer("forwardOrderFn"))).toBe(false);
  });
});

describe("a supplier's first brand registered during a visit", () => {
  const visit = { impersonatedBy: "agent-1", loginEmail: "Marca@Exemplo.com" };

  it("lets the team register it with the orders going to the account's own e-mail", () => {
    expect(() =>
      assertVisitKeepsOrdersEmail({ ...visit, ordersEmail: "marca@exemplo.com" }),
    ).not.toThrow();
    expect(() => assertVisitKeepsOrdersEmail({ ...visit, ordersEmail: null })).not.toThrow();
  });

  it("refuses sending the supplier's orders to another address", () => {
    expect(() =>
      assertVisitKeepsOrdersEmail({ ...visit, ordersEmail: "outro@exemplo.com" }),
    ).toThrow("e-mail da conta do fornecedor");
  });

  it("leaves the supplier free to choose in their own session", () => {
    expect(() =>
      assertVisitKeepsOrdersEmail({
        impersonatedBy: null,
        loginEmail: "marca@exemplo.com",
        ordersEmail: "pedidos@exemplo.com",
      }),
    ).not.toThrow();
  });
});
