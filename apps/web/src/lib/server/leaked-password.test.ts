import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  type FetchRange,
  isLeakedPasswordCheckOn,
  isPasswordLeaked,
  newPasswordOf,
} from "./leaked-password";

const LEAKED = "senha123";
const SHA1 = createHash("sha1").update(LEAKED).digest("hex").toUpperCase();

/** A fake range response: the leaked password's suffix with a count, plus padding lines. */
function rangeResponse(): Response {
  return new Response(
    [`0018A45C4D1DEF81644B54AB7F969B88D65:0`, `${SHA1.slice(5)}:52341`, "FFFFF1D29C0B6A2C:3"].join(
      "\r\n",
    ),
  );
}

describe("isPasswordLeaked", () => {
  it("sends only the first five characters of the hash and finds a leaked password", async () => {
    const fetchRange = vi.fn<FetchRange>(async () => rangeResponse());
    expect(await isPasswordLeaked(LEAKED, fetchRange)).toBe(true);
    const [url] = fetchRange.mock.calls[0] ?? [];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${SHA1.slice(0, 5)}`);
    expect(url).not.toContain(SHA1.slice(5));
  });

  it("lets a password through that is not in the list, or only as zero-count padding", async () => {
    const fetchRange = vi.fn<FetchRange>(async () => rangeResponse());
    expect(await isPasswordLeaked("uma-senha-bem-propria-2026", fetchRange)).toBe(false);
  });

  it("lets the password through when the service is down or slow (decision of item 30)", async () => {
    const down = vi.fn<FetchRange>(async () => new Response("erro", { status: 503 }));
    expect(await isPasswordLeaked(LEAKED, down)).toBe(false);
    const unreachable = vi.fn<FetchRange>(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    expect(await isPasswordLeaked(LEAKED, unreachable)).toBe(false);
  });
});

describe("newPasswordOf", () => {
  it("reads the new password of each route that sets one", () => {
    expect(newPasswordOf("/sign-up/email", { password: "a" })).toBe("a");
    expect(newPasswordOf("/change-password", { newPassword: "b" })).toBe("b");
    expect(newPasswordOf("/reset-password", { newPassword: "c" })).toBe("c");
    expect(newPasswordOf("/sign-in/email", { password: "d" })).toBeNull();
    expect(newPasswordOf("/change-password", {})).toBeNull();
  });
});

describe("isLeakedPasswordCheckOn", () => {
  it("runs in production by default and can be forced either way", () => {
    expect(isLeakedPasswordCheckOn("auto", "production")).toBe(true);
    expect(isLeakedPasswordCheckOn("auto", "test")).toBe(false);
    expect(isLeakedPasswordCheckOn("on", "development")).toBe(true);
    expect(isLeakedPasswordCheckOn("off", "production")).toBe(false);
  });
});
