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

  it("defaults the fee model to today's 14% estimate, no shipping and no minimum margin", () => {
    expect(serverEnvironmentSchema.parse(validEnvironment)).toMatchObject({
      ESTIMATED_MARKETPLACE_FEE_BASIS_POINTS: 1400,
      ESTIMATED_SHIPPING_CENTS: 0,
      MIN_MARGIN_PERCENT: 0,
    });
  });

  it.each([
    ["ESTIMATED_MARKETPLACE_FEE_BASIS_POINTS", "10001"],
    ["ESTIMATED_MARKETPLACE_FEE_BASIS_POINTS", "14.5"],
    ["ESTIMATED_SHIPPING_CENTS", "-1"],
    ["ESTIMATED_SHIPPING_CENTS", "100000001"],
    ["MIN_MARGIN_PERCENT", "91"],
    ["MIN_MARGIN_PERCENT", "-5"],
  ])("refuses %s=%s", (name, value) => {
    const parsed = serverEnvironmentSchema.safeParse({ ...validEnvironment, [name]: value });
    expect(parsed.success).toBe(false);
  });
});
