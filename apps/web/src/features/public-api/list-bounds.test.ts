import { API_EVENT_TYPES, API_SCOPES } from "@sellbridge/shared/public-api";
import { describe, expect, it } from "vitest";
import { createApiKeyInputSchema } from "./api-keys";
import { webhookEventTypesSchema } from "./webhooks";

// Regression: both lists only deduplicated after parsing, so a request could carry thousands of
// repeated entries; now a list longer than its set of options is refused.
describe("enum list bounds", () => {
  it("accepts every event type once, and refuses one entry more", () => {
    expect(webhookEventTypesSchema.safeParse([...API_EVENT_TYPES]).success).toBe(true);
    const tooMany = [...API_EVENT_TYPES, API_EVENT_TYPES[0]];
    expect(webhookEventTypesSchema.safeParse(tooMany).success).toBe(false);
  });

  it("accepts every scope once, and refuses one entry more", () => {
    const key = { name: "ERP", expiresAt: null };
    expect(createApiKeyInputSchema.safeParse({ ...key, scopes: [...API_SCOPES] }).success).toBe(
      true,
    );
    const tooMany = [...API_SCOPES, API_SCOPES[0]];
    expect(createApiKeyInputSchema.safeParse({ ...key, scopes: tooMany }).success).toBe(false);
  });
});
