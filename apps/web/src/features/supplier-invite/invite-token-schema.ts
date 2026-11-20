import { z } from "zod";

/** `<supplier id>.<expiry in Unix seconds>.<HMAC-SHA256 hex>`: what the invite link carries. */
export const supplierInviteTokenSchema = z
  .string()
  .max(120, "Convite inválido")
  .regex(/^[0-9a-f-]{36}\.\d{1,12}\.[0-9a-f]{64}$/, "Convite inválido");
