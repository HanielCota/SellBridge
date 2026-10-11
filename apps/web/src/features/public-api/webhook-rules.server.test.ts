import { describe, expect, it } from "vitest";
import { createWebhookEndpointInputSchema } from "./webhooks";
import {
  assertAcceptableWebhookUrl,
  generateWebhookSecret,
  WEBHOOK_SECRET_PREFIX,
} from "./webhook-rules.server";

describe("webhook endpoint rules", () => {
  it("generates distinct whsec_ secrets", () => {
    const first = generateWebhookSecret();
    expect(first.startsWith(WEBHOOK_SECRET_PREFIX)).toBe(true);
    expect(first.length).toBeGreaterThan(40);
    expect(generateWebhookSecret()).not.toBe(first);
  });

  it("accepts public https URLs in production", () => {
    expect(() => assertAcceptableWebhookUrl("https://erp.example.com/hooks", false)).not.toThrow();
  });

  it.each([
    "http://erp.example.com/hooks",
    "https://localhost/hooks",
    "https://api.localhost/hooks",
    "https://127.0.0.1/hooks",
    "https://169.254.169.254/latest",
    "https://[::1]/hooks",
    "https://[::ffff:10.0.0.1]/hooks",
  ])("refuses %s in production", (url) => {
    expect(() => assertAcceptableWebhookUrl(url, false)).toThrow(
      expect.objectContaining({ code: "VALIDATION" }),
    );
  });

  it("allows local receivers when private URLs are allowed", () => {
    expect(() => assertAcceptableWebhookUrl("http://localhost:4000/hooks", true)).not.toThrow();
  });

  it("normalizes the create input", () => {
    expect(
      createWebhookEndpointInputSchema.parse({
        url: " https://erp.example.com/hooks ",
        description: "  ",
        eventTypes: ["order.created", "order.created"],
      }),
    ).toEqual({
      url: "https://erp.example.com/hooks",
      description: null,
      eventTypes: ["order.created"],
    });
    expect(createWebhookEndpointInputSchema.parse({ url: "https://a.example.com" })).toEqual({
      url: "https://a.example.com",
      description: null,
      eventTypes: [],
    });
    expect(createWebhookEndpointInputSchema.safeParse({ url: "ftp://a.example.com" }).success).toBe(
      false,
    );
    expect(
      createWebhookEndpointInputSchema.safeParse({
        url: "https://a.example.com",
        eventTypes: ["x"],
      }).success,
    ).toBe(false);
  });
});
