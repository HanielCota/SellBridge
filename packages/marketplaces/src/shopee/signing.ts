import { createHmac } from "node:crypto";

function hmacHex(partnerKey: string, text: string): string {
  return createHmac("sha256", partnerKey).update(text, "utf8").digest("hex");
}

/**
 * The `sign` of a Public API call ("API calls", Signature calculation): HMAC-SHA256 with the
 * partner key over `partner_id + api path + timestamp`, in lowercase hex.
 */
export function signPublicCall(input: {
  partnerId: string;
  path: string;
  timestamp: number;
  partnerKey: string;
}): string {
  return hmacHex(input.partnerKey, `${input.partnerId}${input.path}${input.timestamp}`);
}

/** The `sign` of a Shop API call: the public base string followed by `access_token + shop_id`. */
export function signShopCall(input: {
  partnerId: string;
  path: string;
  timestamp: number;
  accessToken: string;
  shopId: string;
  partnerKey: string;
}): string {
  const base = `${input.partnerId}${input.path}${input.timestamp}${input.accessToken}${input.shopId}`;
  return hmacHex(input.partnerKey, base);
}
