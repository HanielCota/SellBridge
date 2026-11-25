import { describe, expect, it } from "vitest";
import { readBearerSecret } from "@/features/public-api/api-key-secret.server";
import {
  generateDeveloperKeySecret,
  hashDeveloperKeySecret,
  readDeveloperBearerSecret,
} from "./developer-key-secret.server";

function bearer(secret: string): Headers {
  return new Headers({ authorization: `Bearer ${secret}` });
}

describe("generateDeveloperKeySecret", () => {
  it("stores only a hash that differs from the secret", () => {
    const generated = generateDeveloperKeySecret();

    expect(generated.secretHash).toBe(hashDeveloperKeySecret(generated.secret));
    expect(generated.secretHash).not.toContain(generated.secret);
    expect(generated.secret.startsWith(generated.prefix)).toBe(true);
    expect(generated.prefix.length).toBeLessThan(generated.secret.length / 2);
  });

  it("creates a different key every time", () => {
    const first = generateDeveloperKeySecret();
    const second = generateDeveloperKeySecret();

    expect(first.secret).not.toBe(second.secret);
  });
});

describe("readDeveloperBearerSecret", () => {
  it("reads a developer key", () => {
    const { secret } = generateDeveloperKeySecret();

    expect(readDeveloperBearerSecret(bearer(secret))).toBe(secret);
  });

  it("refuses an organization key", () => {
    expect(readDeveloperBearerSecret(bearer("sb_live_abcdef"))).toBeNull();
  });

  it("is refused by the organizations' API", () => {
    const { secret } = generateDeveloperKeySecret();

    expect(readBearerSecret(bearer(secret))).toBeNull();
  });

  it("treats a missing header as no key", () => {
    expect(readDeveloperBearerSecret(new Headers())).toBeNull();
  });
});
