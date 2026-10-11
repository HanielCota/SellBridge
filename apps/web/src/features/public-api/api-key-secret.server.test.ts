import { describe, expect, it } from "vitest";
import {
  API_KEY_PREFIX,
  generateApiKeySecret,
  hashApiKeySecret,
  readBearerSecret,
} from "./api-key-secret.server";

describe("generateApiKeySecret", () => {
  it("creates a prefixed secret whose hash, not the secret, is what gets stored", () => {
    const generated = generateApiKeySecret();
    expect(generated.secret.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(generated.secret.length).toBeGreaterThan(40);
    expect(generated.secretHash).toBe(hashApiKeySecret(generated.secret));
    expect(generated.secretHash).not.toContain(generated.secret);
    expect(generated.secret.startsWith(generated.prefix)).toBe(true);
  });

  it("never repeats a secret", () => {
    expect(generateApiKeySecret().secret).not.toBe(generateApiKeySecret().secret);
  });
});

function headers(authorization: string): Headers {
  return new Headers({ authorization });
}

describe("readBearerSecret", () => {
  it("reads a SellBridge key from the Bearer header", () => {
    expect(readBearerSecret(headers("Bearer sb_live_abc"))).toBe("sb_live_abc");
    expect(readBearerSecret(headers("bearer   sb_live_abc  "))).toBe("sb_live_abc");
  });

  it("ignores missing headers, other schemes and foreign tokens", () => {
    expect(readBearerSecret(new Headers())).toBeNull();
    expect(readBearerSecret(headers("Basic sb_live_abc"))).toBeNull();
    expect(readBearerSecret(headers("Bearer eyJhbGciOi"))).toBeNull();
    expect(readBearerSecret(headers("Bearer sb_live_a sb_live_b"))).toBeNull();
  });
});
