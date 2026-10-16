import { createHash, randomBytes } from "node:crypto";

/** How long a supplier link opens the parcel (decision D6: no supplier login, a link instead). */
const SUPPLIER_LINK_DAYS = 30;
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

/** Only this hash is stored: the raw token lives in the link the reseller shares. */
export function hashSupplierToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A new supplier link: the raw token goes to the reseller, only its hash is stored. */
export function issueSupplierLink(): { token: string; hash: string; expiresAt: Date } {
  const token = randomBytes(32).toString("hex");
  return {
    token,
    hash: hashSupplierToken(token),
    expiresAt: new Date(Date.now() + SUPPLIER_LINK_DAYS * DAY_MILLISECONDS),
  };
}
