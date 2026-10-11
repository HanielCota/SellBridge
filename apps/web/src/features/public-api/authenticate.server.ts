import { findActiveApiKey, touchApiKey } from "@sellbridge/database/repositories";
import { type ApiScope, apiScopeSchema } from "@sellbridge/shared/public-api";
import { database } from "@/lib/server/database";
import { hashApiKeySecret, readBearerSecret } from "./api-key-secret.server";
import { proceed, stop, type StepResult } from "./problem";

/** Who is calling: the organization the key belongs to and what it may do. */
export interface ApiCaller {
  tenantId: string;
  apiKeyId: string;
  scopes: readonly ApiScope[];
}

function knownScopes(scopes: readonly string[]): ApiScope[] {
  return scopes.flatMap((scope) => {
    const parsed = apiScopeSchema.safeParse(scope);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Resolves the `Authorization: Bearer` key; revoked, expired or unknown keys get a 401. */
export async function authenticateApiKey(
  headers: Headers,
  now: Date,
): Promise<StepResult<ApiCaller>> {
  const secret = readBearerSecret(headers);
  if (!secret) {
    return stop({
      status: 401,
      code: "unauthorized",
      detail: "Envie a chave no cabeçalho Authorization: Bearer sb_live_...",
      headers: { "www-authenticate": 'Bearer realm="sellbridge"' },
    });
  }
  const key = await findActiveApiKey(database, hashApiKeySecret(secret), now);
  if (!key) {
    return stop({
      status: 401,
      code: "unauthorized",
      detail: "Chave de API inválida, revogada ou expirada.",
      headers: { "www-authenticate": 'Bearer realm="sellbridge", error="invalid_token"' },
    });
  }
  await touchApiKey(database, key.id, now);
  return proceed({ tenantId: key.tenantId, apiKeyId: key.id, scopes: knownScopes(key.scopes) });
}

export function requireScope(caller: ApiCaller, scope: ApiScope | null): StepResult<ApiCaller> {
  if (scope === null || caller.scopes.includes(scope)) {
    return proceed(caller);
  }
  return stop({
    status: 403,
    code: "forbidden",
    detail: `Esta chave não tem o escopo "${scope}". Crie uma chave com ele em Integrações.`,
  });
}
