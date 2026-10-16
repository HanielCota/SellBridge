import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signWebhookPayload, verifyWebhookSignature } from "./webhook-signature.ts";

const secret = "whsec_teste";
const body = JSON.stringify({ id: "evt", type: "order.created", data: { totalCents: 100 } });
const timestamp = 1_767_225_600;
const now = new Date(timestamp * 1000);

describe("webhook signature", () => {
  it("signs `<t>.<body>` with HMAC-SHA256 in hex", () => {
    const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
    expect(signWebhookPayload({ secret, timestamp, body })).toBe(`t=${timestamp},v1=${expected}`);
  });

  it("verifies its own signature within the tolerance", () => {
    const header = signWebhookPayload({ secret, timestamp, body });
    expect(verifyWebhookSignature({ secret, header, body, now })).toBe(true);
    const later = new Date((timestamp + 299) * 1000);
    expect(verifyWebhookSignature({ secret, header, body, now: later })).toBe(true);
  });

  it("rejects other bodies, secrets, old timestamps and malformed headers", () => {
    const header = signWebhookPayload({ secret, timestamp, body });
    expect(verifyWebhookSignature({ secret, header, body: `${body} `, now })).toBe(false);
    expect(verifyWebhookSignature({ secret: "whsec_outro", header, body, now })).toBe(false);
    const late = new Date((timestamp + 301) * 1000);
    expect(verifyWebhookSignature({ secret, header, body, now: late })).toBe(false);
    expect(verifyWebhookSignature({ secret, header, body, now: late, toleranceSeconds: 600 })).toBe(
      true,
    );
    expect(verifyWebhookSignature({ secret, header: "v1=abc", body, now })).toBe(false);
    expect(verifyWebhookSignature({ secret, header: `t=${timestamp},v1=zz`, body, now })).toBe(
      false,
    );
  });

  // Regression: Buffer.from(hex) stops at the first non-hex character, so trailing junk matched.
  it("rejects a valid signature followed by junk", () => {
    const header = `${signWebhookPayload({ secret, timestamp, body })}zz`;
    expect(verifyWebhookSignature({ secret, header, body, now })).toBe(false);
  });

  it("accepts any matching v1 (secret rotation sends more than one)", () => {
    const valid = signWebhookPayload({ secret, timestamp, body }).split(",")[1] ?? "";
    const header = `t=${timestamp},v1=${"0".repeat(64)},${valid}`;
    expect(verifyWebhookSignature({ secret, header, body, now })).toBe(true);
  });
});
