import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { supplierInviteTokenSchema } from "./invite-token-schema";

/** How long an invite to the supplier panel opens. */
export const SUPPLIER_INVITE_DAYS = 14;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const SIGNATURE_PURPOSE = "supplier-invite";

export type SupplierInviteReading =
  { status: "valid"; supplierId: string } | { status: "expired" } | { status: "invalid" };

function signatureOf(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(`${SIGNATURE_PURPOSE}:${payload}`).digest("hex");
}

/**
 * Signs an invite for a team-managed supplier. Nothing is stored: the signature proves the server
 * issued it, and the claim itself checks the account's e-mail and that the supplier has no owner.
 */
export function signSupplierInvite(input: {
  supplierId: string;
  now: Date;
  secret: string;
}): string {
  const expiresAtInSeconds = Math.floor(
    (input.now.getTime() + SUPPLIER_INVITE_DAYS * DAY_IN_MILLISECONDS) / 1000,
  );
  const payload = `${input.supplierId}.${expiresAtInSeconds}`;
  return `${payload}.${signatureOf(payload, input.secret)}`;
}

/** Reads an invite: a forged or malformed one is "invalid", a genuine but old one "expired". */
export function readSupplierInvite(input: {
  token: string;
  now: Date;
  secret: string;
}): SupplierInviteReading {
  const parsed = supplierInviteTokenSchema.safeParse(input.token);
  if (!parsed.success) {
    return { status: "invalid" };
  }
  const [supplierId, expiresAt, signature] = parsed.data.split(".");
  if (supplierId === undefined || expiresAt === undefined || signature === undefined) {
    return { status: "invalid" };
  }
  const expected = Buffer.from(signatureOf(`${supplierId}.${expiresAt}`, input.secret), "hex");
  const received = Buffer.from(signature, "hex");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return { status: "invalid" };
  }
  const expiresAtInMilliseconds = Number(expiresAt) * 1000;
  if (!Number.isFinite(expiresAtInMilliseconds) || expiresAtInMilliseconds <= input.now.getTime()) {
    return { status: "expired" };
  }
  if (!z.uuid().safeParse(supplierId).success) {
    return { status: "invalid" };
  }
  return { status: "valid", supplierId };
}
