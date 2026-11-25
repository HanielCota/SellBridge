import {
  countDeveloperApiRequest,
  countDeveloperRequestsByCreator,
} from "@sellbridge/database/repositories";
import { proceed, stop, type StepResult } from "@/features/public-api/problem";
import type { RateLimitHeaders } from "@/features/public-api/rate-limit.server";
import { database } from "@/lib/server/database";

/** Requests per developer key per minute: enough for a sync job, low enough for the database. */
export const DEVELOPER_REQUESTS_PER_MINUTE = 60;
/** All the keys of one developer together, so twenty keys do not add up to twenty times more. */
export const DEVELOPER_REQUESTS_PER_CREATOR_PER_MINUTE = 120;
const WINDOW_MILLISECONDS = 60_000;

function windowStartOf(now: Date): Date {
  return new Date(Math.floor(now.getTime() / WINDOW_MILLISECONDS) * WINDOW_MILLISECONDS);
}

/** Decides from the counts of this window, the key's own and its creator's. */
export function decideDeveloperRateLimit(input: {
  keyRequests: number;
  creatorRequests: number;
  now: Date;
}): StepResult<RateLimitHeaders> {
  const windowStart = windowStartOf(input.now);
  const resetSeconds = Math.ceil(
    (windowStart.getTime() + WINDOW_MILLISECONDS - input.now.getTime()) / 1000,
  );
  const headers = {
    "ratelimit-limit": String(DEVELOPER_REQUESTS_PER_MINUTE),
    "ratelimit-remaining": String(Math.max(0, DEVELOPER_REQUESTS_PER_MINUTE - input.keyRequests)),
    "ratelimit-reset": String(resetSeconds),
  };
  if (input.keyRequests > DEVELOPER_REQUESTS_PER_MINUTE) {
    return stop({
      status: 429,
      code: "rate_limited",
      detail: `Até ${DEVELOPER_REQUESTS_PER_MINUTE} requisições por minuto por chave. Tente de novo em ${resetSeconds} s.`,
      headers: { ...headers, "retry-after": String(resetSeconds) },
    });
  }
  if (input.creatorRequests > DEVELOPER_REQUESTS_PER_CREATOR_PER_MINUTE) {
    return stop({
      status: 429,
      code: "rate_limited",
      detail: `Até ${DEVELOPER_REQUESTS_PER_CREATOR_PER_MINUTE} requisições por minuto somando todas as suas chaves. Tente de novo em ${resetSeconds} s.`,
      headers: { ...headers, "retry-after": String(resetSeconds) },
    });
  }
  return proceed(headers);
}

export async function enforceDeveloperRateLimit(
  caller: { developerApiKeyId: string; createdByUserId: string },
  now: Date,
): Promise<StepResult<RateLimitHeaders>> {
  const windowStart = windowStartOf(now);
  const keyRequests = await countDeveloperApiRequest(
    database,
    caller.developerApiKeyId,
    windowStart,
  );
  const creatorRequests = await countDeveloperRequestsByCreator(
    database,
    caller.createdByUserId,
    windowStart,
  );
  return decideDeveloperRateLimit({ keyRequests, creatorRequests, now });
}
