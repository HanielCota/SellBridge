import type { DeveloperApiKeySummary } from "@sellbridge/database/repositories";
import { developerScopeSchema, developerScopesSchema } from "@sellbridge/shared/developer-api";
import { freeText } from "@sellbridge/shared/schemas";
import { z } from "zod";

/** Plenty for one key per project; past this, old keys should be revoked first. */
export const MAX_ACTIVE_DEVELOPER_KEYS = 20;

/** Every developer key expires; the developer picks how long it lasts. */
export const DEVELOPER_KEY_VALIDITIES = ["30", "90", "365"] as const;
export type DeveloperKeyValidity = (typeof DEVELOPER_KEY_VALIDITIES)[number];

export const DEVELOPER_KEY_VALIDITY_LABELS: Record<DeveloperKeyValidity, string> = {
  "30": "30 dias",
  "90": "90 dias",
  "365": "1 ano",
};

const developerKeyNameSchema = freeText()
  .trim()
  .min(1, "Dê um nome para a chave, por exemplo o projeto que vai usá-la")
  .max(60, "Use até 60 caracteres");

/** What the server function accepts; the expiration date is decided on the server. */
export const createDeveloperKeyInputSchema = z.object({
  name: developerKeyNameSchema,
  scopes: developerScopesSchema,
  validity: z.enum(DEVELOPER_KEY_VALIDITIES),
});
export type CreateDeveloperKeyInput = z.input<typeof createDeveloperKeyInputSchema>;
export type CreateDeveloperKeyRequest = z.output<typeof createDeveloperKeyInputSchema>;

/** The "Nova chave" form, before the cross-field rule of the server schema. */
export const developerKeyFormSchema = z.object({
  name: developerKeyNameSchema,
  scopes: z.array(developerScopeSchema).min(1, "Escolha pelo menos um tipo de informação"),
  validity: z.enum(DEVELOPER_KEY_VALIDITIES),
});
export type DeveloperKeyFormValues = z.input<typeof developerKeyFormSchema>;

const DAY_MILLISECONDS = 86_400_000;

export function developerKeyExpiration(validity: DeveloperKeyValidity, now: Date): Date {
  return new Date(now.getTime() + Number(validity) * DAY_MILLISECONDS);
}

export type DeveloperKeyStatus = "active" | "revoked" | "expired";

export const DEVELOPER_KEY_STATUS_LABELS: Record<DeveloperKeyStatus, string> = {
  active: "Ativa",
  revoked: "Revogada",
  expired: "Vencida",
};

/** Revocation wins over expiration: it was a deliberate act. */
export function developerKeyStatus(
  key: { revokedAt: Date | null; expiresAt: Date },
  now: Date,
): DeveloperKeyStatus {
  if (key.revokedAt !== null) {
    return "revoked";
  }
  if (key.expiresAt.getTime() <= now.getTime()) {
    return "expired";
  }
  return "active";
}

/** A key as the page shows it, with its status decided by the server's clock. */
export type DeveloperKeyView = DeveloperApiKeySummary & { status: DeveloperKeyStatus };

export function developerKeyCurlExample(origin: string, secret: string): string {
  return `curl ${origin}/api/dev/v1/me -H "Authorization: Bearer ${secret}"`;
}
