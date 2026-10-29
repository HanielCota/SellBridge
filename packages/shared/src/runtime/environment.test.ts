import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  alertWebhookUrlEnvironmentSchema,
  booleanFlagEnvironmentSchema,
  logLevelEnvironmentSchema,
  nodeEnvironmentSchema,
  parseEnvironment,
  refusePrivateWebhookUrlsInProduction,
  shopeeShowcaseUnitsEnvironmentSchema,
} from "./environment.ts";

const schema = z.object({ DATABASE_URL: z.url(), PORT: z.coerce.number().default(3000) });

describe("parseEnvironment", () => {
  it("returns parsed values", () => {
    expect(parseEnvironment(schema, { DATABASE_URL: "postgres://localhost/db" })).toEqual({
      DATABASE_URL: "postgres://localhost/db",
      PORT: 3000,
    });
  });

  it("throws listing missing variables", () => {
    expect(() => parseEnvironment(schema, {})).toThrow(/DATABASE_URL/);
  });

  it("treats blank values as not set, like a copied .env.example", () => {
    const withOptional = schema.extend({ API_KEY: z.string().min(1).optional() });
    expect(
      parseEnvironment(withOptional, {
        DATABASE_URL: "postgres://localhost/db",
        PORT: "",
        API_KEY: "  ",
      }),
    ).toEqual({ DATABASE_URL: "postgres://localhost/db", PORT: 3000 });
    expect(() => parseEnvironment(schema, { DATABASE_URL: "" })).toThrow(/DATABASE_URL/);
  });
});

describe("parseEnvironment renamed variables", () => {
  const renamedVariables = { OLD_DATABASE_URL: "DATABASE_URL" };

  it("fails when a renamed variable is still set", () => {
    const source = { DATABASE_URL: "postgres://localhost/db", OLD_DATABASE_URL: "x" };
    expect(() => parseEnvironment(schema, source, { renamedVariables })).toThrow(
      /OLD_DATABASE_URL: foi renomeada para DATABASE_URL/,
    );
  });

  it("accepts the environment when only the new name is set", () => {
    const source = { DATABASE_URL: "postgres://localhost/db" };
    expect(parseEnvironment(schema, source, { renamedVariables }).PORT).toBe(3000);
  });
});

describe("logLevelEnvironmentSchema", () => {
  it("normalizes case and defaults to info", () => {
    expect(logLevelEnvironmentSchema.parse("WARN")).toBe("warn");
    expect(logLevelEnvironmentSchema.parse(undefined)).toBe("info");
  });

  it("rejects unknown levels", () => {
    expect(logLevelEnvironmentSchema.safeParse("verbose").success).toBe(false);
  });
});

describe("alertWebhookUrlEnvironmentSchema", () => {
  it("accepts an HTTPS webhook or nothing, and refuses plain HTTP", () => {
    const alertSchema = z.object({ ALERT_WEBHOOK_URL: alertWebhookUrlEnvironmentSchema });
    expect(parseEnvironment(alertSchema, { ALERT_WEBHOOK_URL: "" })).toEqual({});
    expect(
      parseEnvironment(alertSchema, { ALERT_WEBHOOK_URL: "https://hooks.example.test/x" }),
    ).toEqual({ ALERT_WEBHOOK_URL: "https://hooks.example.test/x" });
    expect(() =>
      parseEnvironment(alertSchema, { ALERT_WEBHOOK_URL: "http://hooks.example.test/x" }),
    ).toThrow(/ALERT_WEBHOOK_URL/);
  });
});

describe("shopeeShowcaseUnitsEnvironmentSchema", () => {
  const showcaseSchema = z.object({ SHOPEE_SHOWCASE_UNITS: shopeeShowcaseUnitsEnvironmentSchema });
  const parse = (value: string | undefined) =>
    parseEnvironment(showcaseSchema, { SHOPEE_SHOWCASE_UNITS: value }).SHOPEE_SHOWCASE_UNITS;

  it("defaults to 1000 units when unset or blank", () => {
    expect(parse(undefined)).toBe(1000);
    expect(parse("")).toBe(1000);
  });

  it("accepts whole numbers from 0 to 100000", () => {
    expect(parse("0")).toBe(0);
    expect(parse("1500")).toBe(1500);
    expect(parse("100000")).toBe(100_000);
  });

  it.each(["-1", "1.5", "100001", "mil", "NaN"])("refuses %s", (value) => {
    expect(() => parse(value)).toThrow(/SHOPEE_SHOWCASE_UNITS/);
  });
});

// Regression (security audit, 26/10/2026): the worker accepted the development switch in production
// and skipped the private-address guard for every customer webhook delivery.
describe("refusePrivateWebhookUrlsInProduction", () => {
  const workerLike = z
    .object({
      NODE_ENV: nodeEnvironmentSchema,
      WEBHOOK_ALLOW_PRIVATE_URLS: booleanFlagEnvironmentSchema,
    })
    .superRefine(refusePrivateWebhookUrlsInProduction);

  it("refuses the switch in production", () => {
    const variables = { NODE_ENV: "production", WEBHOOK_ALLOW_PRIVATE_URLS: "true" };

    const parse = () => parseEnvironment(workerLike, variables);

    expect(parse).toThrow(/WEBHOOK_ALLOW_PRIVATE_URLS/);
  });

  it("starts production with the switch off", () => {
    const variables = { NODE_ENV: "production" };

    const parsed = parseEnvironment(workerLike, variables);

    expect(parsed.WEBHOOK_ALLOW_PRIVATE_URLS).toBe(false);
  });

  it("keeps the switch on in development", () => {
    const variables = { NODE_ENV: "development", WEBHOOK_ALLOW_PRIVATE_URLS: "true" };

    const parsed = parseEnvironment(workerLike, variables);

    expect(parsed.WEBHOOK_ALLOW_PRIVATE_URLS).toBe(true);
  });
});
