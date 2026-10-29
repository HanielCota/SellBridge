import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VisitingStaff } from "@/lib/server/impersonation-window";

interface SessionShape {
  user: { id: string; image: string | null };
  session: { impersonatedBy: string | null; createdAt: Date };
}

const mocks = vi.hoisted(() => ({
  put: vi.fn<(key: string, bytes: Uint8Array) => Promise<void>>().mockResolvedValue(undefined),
  getSession: vi.fn<() => Promise<SessionShape>>(),
  updateUser: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  findVisitingStaff: vi.fn<(userId: string) => Promise<VisitingStaff | null>>(),
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
  auth: { api: { getSession: mocks.getSession, updateUser: mocks.updateUser } },
}));
vi.mock("@/lib/server/membership", () => ({ listMemberships: vi.fn<() => Promise<[]>>() }));
vi.mock("@/lib/server/visiting-staff", () => ({ findVisitingStaff: mocks.findVisitingStaff }));
// One photo per window keeps the test short; the real budget is in the module.
vi.mock("@/lib/server/upload-rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/upload-rate-limit")>();
  return {
    ...actual,
    avatarUploads: actual.createUploadLimiter({ maxRequests: 1, windowMilliseconds: 60_000 }),
  };
});

const { handleDeleteAvatar, handleUploadAvatar } = await import("./avatar.server");

beforeEach(() => {
  mocks.put.mockClear();
  mocks.updateUser.mockClear();
  mocks.getSession.mockResolvedValue({
    user: { id: "user-1", image: null },
    session: { impersonatedBy: null, createdAt: new Date() },
  });
});

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

function deletion(): Request {
  return new Request("https://sellbridge.test/api/perfil/foto", {
    method: "DELETE",
    headers: { origin: "https://sellbridge.test" },
  });
}

describe("profile photo upload budget", () => {
  it("answers 429 once the account spent its budget, writing nothing more", async () => {
    expect((await handleUploadAvatar(upload())).status).toBe(200);
    expect((await handleUploadAvatar(upload())).status).toBe(429);
    expect(mocks.put).toHaveBeenCalledTimes(1);
  });
});

// Regression (review, 29/10/2026): the photo routes read the session on their own and only
// checked the visit's hour, so a team member banned or demoted since kept changing the photo.
describe("profile photo during a visit", () => {
  beforeEach(() => {
    mocks.getSession.mockResolvedValue({
      user: { id: "customer-1", image: null },
      session: { impersonatedBy: "admin-1", createdAt: new Date() },
    });
    mocks.findVisitingStaff.mockResolvedValue({ role: "admin", banned: true });
  });

  it("refuses an upload once the visiting team member was banned", async () => {
    const response = await handleUploadAvatar(upload());

    expect(response.status).toBe(401);
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.findVisitingStaff).toHaveBeenCalledWith("admin-1");
  });

  it("refuses a removal once the visiting team member was banned", async () => {
    const response = await handleDeleteAvatar(deletion());

    expect(response.status).toBe(401);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});
