import { completeIdempotencyKey, reserveIdempotencyKey } from "@sellbridge/database/repositories";
import { createHash } from "node:crypto";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { tokenCipher } from "@/lib/server/marketplaces";
import { proceed, stop, type StepResult } from "./problem";

const IDEMPOTENCY_KEY_PATTERN = /^[\w.:-]{8,255}$/;

/** A claimed key: the response must be stored (or the key released) when the request ends. */
export interface IdempotencyClaim {
  tenantId: string;
  key: string;
}

export type IdempotencyStart =
  { kind: "claimed"; claim: IdempotencyClaim } | { kind: "replay"; status: number; body: unknown };

/** Method, path and body: the same key with a different request is a client bug. */
function requestHash(request: { method: string; path: string; body: string }): string {
  return createHash("sha256")
    .update(`${request.method} ${request.path}\n${request.body}`)
    .digest("hex");
}

/**
 * Writes must carry an `Idempotency-Key`: a client that times out can send the exact same
 * request again and gets the first response back instead of a second listing.
 */
export async function startIdempotentRequest(input: {
  tenantId: string;
  headers: Headers;
  method: string;
  path: string;
  body: string;
  now: Date;
}): Promise<StepResult<IdempotencyStart>> {
  const key = input.headers.get("idempotency-key")?.trim();
  if (!key || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
    return stop({
      status: 400,
      code: "idempotency_key_required",
      detail:
        "Envie o cabeçalho Idempotency-Key com um valor único por operação (8 a 255 caracteres, por exemplo um UUID).",
    });
  }
  const reservation = await reserveIdempotencyKey(database, {
    tenantId: input.tenantId,
    key,
    requestHash: requestHash(input),
    now: input.now,
  });
  if (reservation.status === "reserved") {
    return proceed({ kind: "claimed", claim: { tenantId: input.tenantId, key } });
  }
  if (reservation.status === "replay") {
    return proceed({
      kind: "replay",
      status: reservation.responseStatus,
      body: readStoredBody(reservation.responseBody),
    });
  }
  if (reservation.status === "in_progress") {
    return stop({
      status: 409,
      code: "idempotency_in_progress",
      detail: "A primeira requisição com esta Idempotency-Key ainda está sendo processada.",
      headers: { "retry-after": "1" },
    });
  }
  return stop({
    status: 422,
    code: "idempotency_key_reused",
    detail: "Esta Idempotency-Key já foi usada numa requisição diferente. Gere uma nova.",
  });
}

/**
 * Stores the outcome, whatever it was, for replay. A 5xx is stored too: the failure may have
 * come after the listing was saved (the queue was down, say), and releasing the key would let
 * the retry create a second one. A request that died midway is freed after a few minutes
 * instead (see reserveIdempotencyKey). The body is encrypted at rest: it can hold a secret
 * shown only once, like a new webhook's signing secret.
 */
export async function finishIdempotentRequest(
  claim: IdempotencyClaim,
  response: { status: number; body: unknown },
): Promise<void> {
  await completeIdempotencyKey(database, {
    ...claim,
    responseStatus: response.status,
    responseBody: { encrypted: tokenCipher.encrypt(JSON.stringify(response.body)) },
  });
}

const storedBodySchema = z.object({ encrypted: z.string() });

/** The stored response body, or null when it can't be read back (key rotated, old format). */
export function readStoredBody(stored: unknown): unknown {
  const parsed = storedBodySchema.safeParse(stored);
  if (!parsed.success) {
    return null;
  }
  try {
    return JSON.parse(tokenCipher.decrypt(parsed.data.encrypted));
  } catch {
    return null;
  }
}
