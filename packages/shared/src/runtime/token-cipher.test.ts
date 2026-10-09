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
    const data = parts[3] ?? "";
    const tampered = [...parts.slice(0, 3), `${data.slice(0, -2)}AA`].join(".");
    expect(() => cipher.decrypt(tampered)).toThrow("Não foi possível descriptografar");
  });

  it("rejects values from another key", () => {
    const encrypted = createTokenCipher(key).encrypt("token");
    const otherKey = randomBytes(32).toString("base64");
    expect(() => createTokenCipher(otherKey).decrypt(encrypted)).toThrow(
      "Não foi possível descriptografar",
    );
  });

  it("rejects malformed input", () => {
    expect(() => createTokenCipher(key).decrypt("not-encrypted")).toThrow("formato inválido");
  });

  it("requires a 32-byte key", () => {
    expect(() => createTokenCipher(Buffer.from("short").toString("base64"))).toThrow("32 bytes");
  });
});
