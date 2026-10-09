import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ConfigurationError, ValidationError } from "@sellbridge/shared/errors";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = "v1";

function parseKey(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) {
    throw new ConfigurationError("TOKEN_ENCRYPTION_KEY deve ter 32 bytes em base64");
  }
  return key;
}

export interface TokenCipher {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}

/**
 * AES-256-GCM with a random IV per value. Output format: `v1.<iv>.<tag>.<data>`
 * (base64url). The auth tag makes any tampering fail on decrypt.
 */
export function createTokenCipher(base64Key: string): TokenCipher {
  const key = parseKey(base64Key);

  function encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
    const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv, tag, data]
      .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
      .join(".");
  }

  function decrypt(ciphertext: string): string {
    const [version, ivPart, tagPart, dataPart] = ciphertext.split(".");
    if (version !== VERSION || !ivPart || !tagPart || dataPart === undefined) {
      throw new ValidationError("Token criptografado em formato inválido");
    }
    try {
      const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivPart, "base64url"), {
        authTagLength: TAG_BYTES,
      });
      decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(dataPart, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    } catch (error) {
      throw new ValidationError("Não foi possível descriptografar o token", [String(error)]);
    }
  }

  return { encrypt, decrypt };
}
