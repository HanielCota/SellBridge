import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consumeDeveloperEntryLink: vi.fn<() => Promise<unknown>>(),
  recordDeveloperApiRequest: vi.fn<(database: unknown, record: unknown) => Promise<void>>(),
}));

vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@sellbridge/database/repositories", () => mocks);

const { consumeEntryLinkClick } = await import("./consume-entry-link.server");

const NOW = new Date("2026-11-25T12:00:00Z");
const TOKEN = "a".repeat(43);
const ISSUER = { linkId: "link-1", keyId: "key-1", keyPrefix: "sb_dev_abcdef" };

function click(token = TOKEN, secureCookie = true) {
  return consumeEntryLinkClick({ token, secureCookie }, NOW);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.consumeDeveloperEntryLink.mockResolvedValue({ kind: "consumed", issuer: ISSUER });
  mocks.recordDeveloperApiRequest.mockResolvedValue(undefined);
});

describe("consumeEntryLinkClick", () => {
  it("sends the person to a page without the token and keeps the choice in an httpOnly cookie", async () => {
    const response = await click();

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/entrar");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^sb_entry_choice=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).not.toContain(TOKEN);
  });

  it("keeps the token out of caches and referrers", async () => {
    const response = await click();

    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("records the click in the usage trail of the key that made the link", async () => {
    await click();

    expect(mocks.recordDeveloperApiRequest).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        developerApiKeyId: "key-1",
        operation: "openEntryLink",
        resourceId: "link-1",
        status: 200,
      }),
    );
  });

  it("hands no choice on a second click and says the link was used", async () => {
    mocks.consumeDeveloperEntryLink.mockResolvedValue({ kind: "used", issuer: ISSUER });

    const response = await click();

    expect(response.headers.get("location")).toBe("/entrar?situacao=usado");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("says an old link expired", async () => {
    mocks.consumeDeveloperEntryLink.mockResolvedValue({ kind: "expired", issuer: ISSUER });

    const response = await click();

    expect(response.headers.get("location")).toBe("/entrar?situacao=vencido");
  });

  it("refuses a malformed token without looking it up", async () => {
    const response = await click("../../dashboard");

    expect(response.headers.get("location")).toBe("/entrar?situacao=invalido");
    expect(mocks.consumeDeveloperEntryLink).not.toHaveBeenCalled();
  });

  it("leaves Secure out only on a plain http test site", async () => {
    const response = await click(TOKEN, false);

    expect(response.headers.get("set-cookie")).not.toContain("Secure");
  });
});
