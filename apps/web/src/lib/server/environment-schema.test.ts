import { describe, expect, it } from "vitest";
import { carrierTrackingProviderName, serverEnvironmentSchema } from "./environment-schema.ts";

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

  it("reads the trusted origins as a list of bare origins", () => {
    expect(serverEnvironmentSchema.parse(validEnvironment).BETTER_AUTH_TRUSTED_ORIGINS).toEqual([]);
    const parsed = serverEnvironmentSchema.parse({
      ...validEnvironment,
      BETTER_AUTH_TRUSTED_ORIGINS: " http://127.0.0.1:4850/ ,http://cadastro.localhost:4850",
    });
    expect(parsed.BETTER_AUTH_TRUSTED_ORIGINS).toEqual([
      "http://127.0.0.1:4850",
      "http://cadastro.localhost:4850",
    ]);
  });

  describe("billing in production (item 16, N8)", () => {
    const stripe = {
      STRIPE_SECRET_KEY: "sk_live_x",
      STRIPE_WEBHOOK_SECRET: "whsec_x",
      STRIPE_PRO_PRICE_ID: "price_pro",
      STRIPE_BUSINESS_PRICE_ID: "price_business",
    };
    const production = { ...validEnvironment, NODE_ENV: "production" };

    // Regression: without the Stripe variables production silently ran with no plan limits.
    it("refuses to start without Stripe", () => {
      const parsed = serverEnvironmentSchema.safeParse(production);
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues[0]?.path).toEqual(["STRIPE_SECRET_KEY"]);
    });

    it("refuses a partial Stripe configuration", () => {
      const parsed = serverEnvironmentSchema.safeParse({
        ...production,
        ...stripe,
        STRIPE_WEBHOOK_SECRET: undefined,
      });
      expect(parsed.error?.issues[0]?.path).toEqual(["STRIPE_WEBHOOK_SECRET"]);
    });

    it("starts with Stripe complete or with the explicit unlimited mode", () => {
      expect(serverEnvironmentSchema.safeParse({ ...production, ...stripe }).success).toBe(true);
      const unlimited = serverEnvironmentSchema.safeParse({
        ...production,
        BILLING_UNLIMITED: "true",
      });
      expect(unlimited.success).toBe(true);
    });

    it("keeps development free of Stripe and defaults the grace to 7 days", () => {
      expect(serverEnvironmentSchema.parse(validEnvironment)).toMatchObject({
        BILLING_UNLIMITED: false,
        BILLING_PAST_DUE_GRACE_DAYS: 7,
      });
    });
  });

  describe("CARRIER_TRACKING_PROVIDER", () => {
    it("defaults to disconnected tracking in every environment", () => {
      const development = serverEnvironmentSchema.parse(validEnvironment);
      expect(carrierTrackingProviderName(development)).toBe("off");
      expect(
        carrierTrackingProviderName({
          CARRIER_TRACKING_PROVIDER: undefined,
        }),
      ).toBe("off");
    });

    it("refuses simulated carrier events in production", () => {
      const parsed = serverEnvironmentSchema.safeParse({
        ...validEnvironment,
        NODE_ENV: "production",
        BILLING_UNLIMITED: "true",
        CARRIER_TRACKING_PROVIDER: "simulated",
      });
      expect(parsed.error?.issues.map((issue) => issue.path)).toEqual([
        ["CARRIER_TRACKING_PROVIDER"],
      ]);
    });

    it("keeps an explicit off in development", () => {
      const parsed = serverEnvironmentSchema.parse({
        ...validEnvironment,
        CARRIER_TRACKING_PROVIDER: "off",
      });
      expect(carrierTrackingProviderName(parsed)).toBe("off");
    });
  });

  // Regression (security audit, 26/10/2026): production accepted the development switch that turns
  // off the guard keeping customer webhooks away from internal addresses.
  describe("WEBHOOK_ALLOW_PRIVATE_URLS", () => {
    it("refuses the switch in production", () => {
      const parsed = serverEnvironmentSchema.safeParse({
        ...validEnvironment,
        NODE_ENV: "production",
        BILLING_UNLIMITED: "true",
        WEBHOOK_ALLOW_PRIVATE_URLS: "true",
      });
      expect(parsed.error?.issues.map((issue) => issue.path)).toEqual([
        ["WEBHOOK_ALLOW_PRIVATE_URLS"],
      ]);
    });

    it("keeps the switch in development", () => {
      const parsed = serverEnvironmentSchema.parse({
        ...validEnvironment,
        WEBHOOK_ALLOW_PRIVATE_URLS: "true",
      });
      expect(parsed.WEBHOOK_ALLOW_PRIVATE_URLS).toBe(true);
    });
  });
});
