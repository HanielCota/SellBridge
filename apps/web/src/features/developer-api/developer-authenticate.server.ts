import { findActiveDeveloperApiKey, touchDeveloperApiKey } from "@sellbridge/database/repositories";
import { type DeveloperScope, knownDeveloperScopes } from "@sellbridge/shared/developer-api";
import { proceed, stop, type StepResult } from "@/features/public-api/problem";
import { database } from "@/lib/server/database";
import { isDeveloperAccount } from "./developer-access";
import { hashDeveloperKeySecret, readDeveloperBearerSecret } from "./developer-key-secret.server";

/** The developer key behind a request and what it may read. */
export interface DeveloperCaller {
  developerApiKeyId: string;
  name: string;
  prefix: string;
  scopes: readonly DeveloperScope[];
  expiresAt: Date;
}

const INVALID_KEY_HEADERS = {
  "www-authenticate": 'Bearer realm="sellbridge-dev", error="invalid_token"',
};

function invalidKey<TValue>(): StepResult<TValue> {
  return stop({
    status: 401,
    code: "unauthorized",
    detail: "Chave de desenvolvedor inválida, revogada ou vencida.",
    headers: INVALID_KEY_HEADERS,
  });
}

/**
 * Resolves the `Authorization: Bearer sb_dev_...` key. Revoked, expired or unknown keys get a
 * 401, and so does a key whose creator left `DEVELOPER_EMAILS` or was blocked: removing a
 * developer from the list turns off every key they made.
 */
export async function authenticateDeveloperKey(
  headers: Headers,
  now: Date,
  developerEmails: readonly string[],
): Promise<StepResult<DeveloperCaller>> {
  const secret = readDeveloperBearerSecret(headers);
  if (secret === null) {
    return stop({
      status: 401,
      code: "unauthorized",
      detail: "Envie a chave no cabeçalho Authorization: Bearer sb_dev_...",
      headers: { "www-authenticate": 'Bearer realm="sellbridge-dev"' },
    });
  }
  const key = await findActiveDeveloperApiKey(database, hashDeveloperKeySecret(secret), now);
  if (key === null) {
    return invalidKey();
  }
  const creator = {
    email: key.creatorEmail,
    emailVerified: key.creatorEmailVerified,
    banned: key.creatorBanned,
  };
  if (!isDeveloperAccount(creator, developerEmails)) {
    return invalidKey();
  }
  await touchDeveloperApiKey(database, key.id, now);
  return proceed({
    developerApiKeyId: key.id,
    name: key.name,
    prefix: key.prefix,
    scopes: knownDeveloperScopes(key.scopes),
    expiresAt: key.expiresAt,
  });
}

export function requireDeveloperScope(
  caller: DeveloperCaller,
  scope: DeveloperScope | null,
): StepResult<DeveloperCaller> {
  if (scope === null || caller.scopes.includes(scope)) {
    return proceed(caller);
  }
  return stop({
    status: 403,
    code: "forbidden",
    detail: `Esta chave não libera "${scope}". Crie outra chave marcando esse tipo de informação.`,
  });
}
