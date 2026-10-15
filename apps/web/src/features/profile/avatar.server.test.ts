import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  put: vi.fn<(key: string, bytes: Uint8Array) => Promise<void>>().mockResolvedValue(undefined),
}));

vi.mock("@/lib/server/storage", () => ({
  fileStorage: {
    put: mocks.put,
    get: vi.fn<() => Promise<null>>(),
    delete: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  },
}));
vi.mock("@/lib/server/environment", () => ({
  environment: { APP_URL: "https://sellbridge.test" },
}));
vi.mock("@/lib/server/auth", () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: { id: "user-1", image: null },
        session: { impersonatedBy: null, createdAt: new Date() },
      }),
      updateUser: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    },
  },
}));
// One photo per window keeps the test short; the real budget is in the module.
vi.mock("@/lib/server/upload-rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/upload-rate-limit")>();
  return {
    ...actual,
    avatarUploads: actual.createUploadLimiter({ maxRequests: 1, windowMilliseconds: 60_000 }),
  };
});

const { handleUploadAvatar } = await import("./avatar.server");

/** A 1×1 PNG: the smallest file the photo checks accept. */
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  ),
  (character) => character.charCodeAt(0),
);

function upload(): Request {
  const form = new FormData();
  form.set("file", new File([PNG], "foto.png", { type: "image/png" }));
  return new Request("https://sellbridge.test/api/perfil/foto", {
    method: "POST",
    headers: { origin: "https://sellbridge.test" },
    body: form,
  });
}

describe("profile photo upload budget", () => {
  it("answers 429 once the account spent its budget, writing nothing more", async () => {
    expect((await handleUploadAvatar(upload())).status).toBe(200);
    expect((await handleUploadAvatar(upload())).status).toBe(429);
    expect(mocks.put).toHaveBeenCalledTimes(1);
  });
});
