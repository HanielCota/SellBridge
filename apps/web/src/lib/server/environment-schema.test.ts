import { describe, expect, it } from "vitest";
import { serverEnvironmentSchema } from "./environment-schema.ts";

const validEnvironment = {
  DATABASE_URL: "postgres://localhost/sellbridge",
  REDIS_URL: "redis://localhost:6379",
  APP_URL: "https://app.sellbridge.com.br",
  BETTER_AUTH_URL: "https://app.sellbridge.com.br",
  BETTER_AUTH_SECRET: "a-real-secret-with-more-than-32-characters",
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
};

const placeholderSecret = "troque-por-um-segredo-com-32-caracteres-ou-mais";

describe("serverEnvironmentSchema", () => {
  it("rejects the .env.example secret in production", () => {
    const parsed = serverEnvironmentSchema.safeParse({
      ...validEnvironment,
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: placeholderSecret,
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["BETTER_AUTH_SECRET"]);
  });

  it("keeps accepting the placeholder in development", () => {
    const parsed = serverEnvironmentSchema.safeParse({
      ...validEnvironment,
      BETTER_AUTH_SECRET: placeholderSecret,
    });
    expect(parsed.success).toBe(true);
  });

  it("normalizes the client IP header and defaults to x-forwarded-for", () => {
    expect(serverEnvironmentSchema.parse(validEnvironment).CLIENT_IP_HEADER).toBe(
      "x-forwarded-for",
    );
    const cloudflare = serverEnvironmentSchema.parse({
      ...validEnvironment,
      CLIENT_IP_HEADER: " CF-Connecting-IP ",
    });
    expect(cloudflare.CLIENT_IP_HEADER).toBe("cf-connecting-ip");
  });
});
