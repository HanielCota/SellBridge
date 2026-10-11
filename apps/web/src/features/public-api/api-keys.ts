import type { ApiKeySummary } from "@sellbridge/database/repositories";
import { type ApiScope, apiScopeSchema } from "@sellbridge/shared/public-api";
import { z } from "zod";

/** Enough for one key per integration and environment; past this, old keys should be revoked. */
export const MAX_ACTIVE_API_KEYS = 20;

export const apiKeyNameSchema = z
  .string()
  .trim()
  .min(1, "Dê um nome para a chave")
  .max(60, "Use até 60 caracteres");

const apiKeyScopesSchema = z
  .array(apiScopeSchema)
  .min(1, "Escolha pelo menos uma permissão")
  .transform((scopes) => [...new Set(scopes)]);

/** What the server function accepts; whether `expiresAt` is in the future is checked there. */
export const createApiKeyInputSchema = z.object({
  name: apiKeyNameSchema,
  scopes: apiKeyScopesSchema,
  expiresAt: z.iso.datetime().nullable(),
});
export type CreateApiKeyInput = z.input<typeof createApiKeyInputSchema>;
export type CreateApiKeyRequest = z.output<typeof createApiKeyInputSchema>;

export const API_KEY_EXPIRATIONS = ["never", "30", "90", "365"] as const;
export type ApiKeyExpiration = (typeof API_KEY_EXPIRATIONS)[number];

export const API_KEY_EXPIRATION_LABELS: Record<ApiKeyExpiration, string> = {
  never: "Nunca",
  "30": "30 dias",
  "90": "90 dias",
  "365": "1 ano",
};

/** The "Nova chave" form: expiration is a choice of period, turned into a date on submit. */
export const apiKeyFormSchema = z.object({
  name: apiKeyNameSchema,
  scopes: z.array(apiScopeSchema).min(1, "Escolha pelo menos uma permissão"),
  expiration: z.enum(API_KEY_EXPIRATIONS),
});
export type ApiKeyFormValues = z.input<typeof apiKeyFormSchema>;

const DAY_MILLISECONDS = 86_400_000;

export function toCreateApiKeyInput(values: ApiKeyFormValues, now: Date): CreateApiKeyInput {
  const expiresAt =
    values.expiration === "never"
      ? null
      : new Date(now.getTime() + Number(values.expiration) * DAY_MILLISECONDS).toISOString();
  return { name: values.name.trim(), scopes: values.scopes, expiresAt };
}

export type ApiKeyStatus = "active" | "revoked" | "expired";

export const API_KEY_STATUS_LABELS: Record<ApiKeyStatus, string> = {
  active: "Ativa",
  revoked: "Revogada",
  expired: "Expirada",
};

/** Revocation wins over expiration: it was a deliberate act and is what people remember. */
export function apiKeyStatus(
  key: { revokedAt: Date | null; expiresAt: Date | null },
  now: Date,
): ApiKeyStatus {
  if (key.revokedAt) {
    return "revoked";
  }
  if (key.expiresAt && key.expiresAt.getTime() <= now.getTime()) {
    return "expired";
  }
  return "active";
}

/** A key as the Integrações page shows it, with its status decided by the server's clock. */
export type ApiKeyView = ApiKeySummary & { status: ApiKeyStatus };

/** Keys created before a scope was retired keep the string; the UI shows only known ones. */
export function knownApiScopes(scopes: readonly string[]): ApiScope[] {
  return scopes.flatMap((scope) => {
    const parsed = apiScopeSchema.safeParse(scope);
    return parsed.success ? [parsed.data] : [];
  });
}

/** What an integrator pastes in a terminal to check the key works. */
export function apiKeyCurlExample(origin: string, secret: string): string {
  return `curl ${origin}/api/v1/me -H "Authorization: Bearer ${secret}"`;
}
