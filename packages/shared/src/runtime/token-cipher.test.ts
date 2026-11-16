import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createTokenCipher } from "./token-cipher.ts";

const key = randomBytes(32).toString("base64");

describe("createTokenCipher", () => {
  it("round-trips a token", () => {
    const cipher = createTokenCipher(key);
    const encrypted = cipher.encrypt("APP_USR-123-secret");
    expect(encrypted).not.toContain("secret");
    expect(cipher.decrypt(encrypted)).toBe("APP_USR-123-secret");
  });

  it("uses a random IV so equal tokens produce different ciphertexts", () => {
    const cipher = createTokenCipher(key);
    expect(cipher.encrypt("same")).not.toBe(cipher.encrypt("same"));
  });

  it("rejects tampered ciphertext", () => {
    const cipher = createTokenCipher(key);
    const parts = cipher.encrypt("token").split(".");
    // Flip every bit of the first data byte: rewriting base64 characters could leave the bytes
    // unchanged (about once in a thousand runs) and let the test pass on an untouched value.
    const data = Buffer.from(parts[3] ?? "", "base64url");
    data.writeUInt8((data.readUInt8(0) ^ 0xff) & 0xff, 0);
    const tampered = [...parts.slice(0, 3), data.toString("base64url")].join(".");
    expect(() => cipher.decrypt(tampered)).toThrow("Conecte a loja de novo");
  });

  it("rejects values from another key", () => {
    const encrypted = createTokenCipher(key).encrypt("token");
    const otherKey = randomBytes(32).toString("base64");
    expect(() => createTokenCipher(otherKey).decrypt(encrypted)).toThrow("Conecte a loja de novo");
  });

  it("rejects malformed input", () => {
    expect(() => createTokenCipher(key).decrypt("not-encrypted")).toThrow(
      expect.objectContaining({ details: { issues: ["malformed ciphertext"] } }),
    );
  });

  it("tells the store owner to reconnect, never the technical reason", () => {
    expect(() => createTokenCipher(key).decrypt("not-encrypted")).toThrow(
      "A conexão com a loja caiu. Conecte a loja de novo.",
    );
  });

  it("requires a 32-byte key", () => {
    expect(() => createTokenCipher(Buffer.from("short").toString("base64"))).toThrow("32 bytes");
  });
});
