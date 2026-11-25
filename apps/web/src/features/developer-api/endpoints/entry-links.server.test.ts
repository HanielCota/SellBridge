import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findOfferedSupplierProductIds: vi.fn<() => Promise<string[]>>(),
  createDeveloperEntryLink: vi.fn<(database: unknown, link: unknown) => Promise<{ id: string }>>(),
}));

vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/environment", () => ({
  environment: { APP_URL: "https://app.sellbridge.test/", DEVELOPER_EMAILS: [] },
}));
vi.mock("@sellbridge/database/repositories", () => mocks);

const { createDeveloperEntryLinkEndpoint } = await import("./entry-links.server");
const { entryLinkTokenSchema, hashEntryLinkToken } = await import("../entry-link-token.server");

const NOW = new Date("2026-11-25T12:00:00Z");
const SUPPLIER_ID = "0b6c2c8e-8f0e-4c7a-9a39-3d4b2a1e0f10";
const PRODUCT_A = "1b6c2c8e-8f0e-4c7a-9a39-3d4b2a1e0f11";
const PRODUCT_B = "2b6c2c8e-8f0e-4c7a-9a39-3d4b2a1e0f12";

function caller() {
  return {
    developerApiKeyId: "key-1",
    name: "Outro projeto",
    prefix: "sb_dev_abcdef",
    scopes: ["links:create" as const],
    expiresAt: new Date("2026-12-25T12:00:00Z"),
  };
}

async function createLink(productIds: string[]) {
  return createDeveloperEntryLinkEndpoint.handle({
    caller: caller(),
    body: { supplierId: SUPPLIER_ID, productIds },
    requestId: "request-1",
    now: NOW,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findOfferedSupplierProductIds.mockResolvedValue([PRODUCT_A, PRODUCT_B]);
  mocks.createDeveloperEntryLink.mockResolvedValue({ id: "link-1" });
});

describe("createDeveloperEntryLinkEndpoint", () => {
  it("returns a link that carries only a random token", async () => {
    const result = await createLink([PRODUCT_A]);

    const token = result.data.url.replace("https://app.sellbridge.test/entrar/", "");
    expect(entryLinkTokenSchema.safeParse(token).success).toBe(true);
  });

  it("stores only the hash of the token", async () => {
    const result = await createLink([PRODUCT_A]);

    const token = result.data.url.split("/").at(-1) ?? "";
    expect(mocks.createDeveloperEntryLink).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ tokenHash: hashEntryLinkToken(token), keyId: "key-1" }),
    );
    expect(JSON.stringify(mocks.createDeveloperEntryLink.mock.calls)).not.toContain(token);
  });

  it("makes the link expire one hour after it was created", async () => {
    const result = await createLink([PRODUCT_A]);

    expect(result.data.expiresAt).toBe("2026-11-25T13:00:00.000Z");
  });

  it("refuses products resellers cannot pick and names them", async () => {
    mocks.findOfferedSupplierProductIds.mockResolvedValue([PRODUCT_A]);

    const creating = createLink([PRODUCT_A, PRODUCT_B]);

    await expect(creating).rejects.toMatchObject({
      code: "VALIDATION",
      details: { issues: [PRODUCT_B] },
    });
    expect(mocks.createDeveloperEntryLink).not.toHaveBeenCalled();
  });
});
