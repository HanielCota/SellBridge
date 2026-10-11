import {
  completeIdempotencyKey,
  releaseIdempotencyKey,
  reserveIdempotencyKey,
} from "@sellbridge/database/repositories";
import { createHash } from "node:crypto";
import { database } from "@/lib/server/database";
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
      body: reservation.responseBody,
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
 * Stores the outcome to replay later. Server errors release the key instead: the operation
 * may not have happened, so the client must be able to retry with the same key.
 */
export async function finishIdempotentRequest(
  claim: IdempotencyClaim,
  response: { status: number; body: unknown },
): Promise<void> {
  if (response.status >= 500) {
    await releaseIdempotencyKey(database, claim);
    return;
  }
  await completeIdempotencyKey(database, {
    ...claim,
    responseStatus: response.status,
    responseBody: response.body,
  });
}
