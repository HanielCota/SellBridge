import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findActiveDeveloperApiKey: vi.fn<(database: unknown, hash: string) => Promise<unknown>>(),
  touchDeveloperApiKey: vi.fn<() => Promise<void>>(),
}));

vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@sellbridge/database/repositories", () => mocks);

const { authenticateDeveloperKey, requireDeveloperScope } =
  await import("./developer-authenticate.server");
const { generateDeveloperKeySecret } = await import("./developer-key-secret.server");

const NOW = new Date("2026-11-25T12:00:00Z");
const DEVELOPERS = ["dev@sellbridge.test"];

function activeKey(overrides: Record<string, unknown> = {}) {
  return {
    id: "key-1",
    createdByUserId: "dev-1",
    name: "Painel",
    prefix: "sb_dev_abcdef",
    scopes: ["orders:read"],
    expiresAt: new Date("2026-12-25T12:00:00Z"),
    creatorEmail: "dev@sellbridge.test",
    creatorEmailVerified: true,
    creatorBanned: false,
    ...overrides,
  };
}

function headersFor(secret: string): Headers {
  return new Headers({ authorization: `Bearer ${secret}` });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findActiveDeveloperApiKey.mockResolvedValue(activeKey());
});

describe("authenticateDeveloperKey", () => {
  it("admits a valid key of a listed developer, looking it up by hash only", async () => {
    const { secret, secretHash } = generateDeveloperKeySecret();

    const result = await authenticateDeveloperKey(headersFor(secret), NOW, DEVELOPERS);

    expect(result.ok).toBe(true);
    expect(mocks.findActiveDeveloperApiKey).toHaveBeenCalledWith({}, secretHash, NOW);
  });

  it("refuses an organization key without looking it up", async () => {
    const result = await authenticateDeveloperKey(headersFor("sb_live_abc"), NOW, DEVELOPERS);

    expect(result).toMatchObject({ ok: false, problem: { status: 401 } });
    expect(mocks.findActiveDeveloperApiKey).not.toHaveBeenCalled();
  });

  it("refuses a revoked, expired or unknown key", async () => {
    mocks.findActiveDeveloperApiKey.mockResolvedValue(null);
    const { secret } = generateDeveloperKeySecret();

    const result = await authenticateDeveloperKey(headersFor(secret), NOW, DEVELOPERS);

    expect(result).toMatchObject({ ok: false, problem: { status: 401 } });
  });

  it("refuses the key of a creator removed from the developer list", async () => {
    const { secret } = generateDeveloperKeySecret();

    const result = await authenticateDeveloperKey(headersFor(secret), NOW, [
      "other@sellbridge.test",
    ]);

    expect(result).toMatchObject({ ok: false, problem: { status: 401 } });
    expect(mocks.touchDeveloperApiKey).not.toHaveBeenCalled();
  });

  it("refuses the key of a blocked creator", async () => {
    mocks.findActiveDeveloperApiKey.mockResolvedValue(activeKey({ creatorBanned: true }));
    const { secret } = generateDeveloperKeySecret();

    const result = await authenticateDeveloperKey(headersFor(secret), NOW, DEVELOPERS);

    expect(result).toMatchObject({ ok: false, problem: { status: 401 } });
  });
});

describe("requireDeveloperScope", () => {
  const caller = {
    developerApiKeyId: "key-1",
    createdByUserId: "dev-1",
    name: "Painel",
    prefix: "sb_dev_abcdef",
    scopes: ["orders:read" as const],
    expiresAt: NOW,
  };

  it("lets a key read what it was given", () => {
    expect(requireDeveloperScope(caller, "orders:read").ok).toBe(true);
  });

  it("refuses a key without the scope", () => {
    expect(requireDeveloperScope(caller, "stores:read")).toMatchObject({
      ok: false,
      problem: { status: 403 },
    });
  });

  it("refuses the buyer's personal data to a key with orders only", () => {
    expect(requireDeveloperScope(caller, "buyers:personal").ok).toBe(false);
  });
});
