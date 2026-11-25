import { countDeveloperApiRequest } from "@sellbridge/database/repositories";
import { proceed, stop, type StepResult } from "@/features/public-api/problem";
import type { RateLimitHeaders } from "@/features/public-api/rate-limit.server";
import { database } from "@/lib/server/database";

/** Requests per developer key per minute: enough for a sync job, low enough for the database. */
export const DEVELOPER_REQUESTS_PER_MINUTE = 60;
const WINDOW_MILLISECONDS = 60_000;

function windowStartOf(now: Date): Date {
  return new Date(Math.floor(now.getTime() / WINDOW_MILLISECONDS) * WINDOW_MILLISECONDS);
}

export async function enforceDeveloperRateLimit(
  developerApiKeyId: string,
  now: Date,
): Promise<StepResult<RateLimitHeaders>> {
  const windowStart = windowStartOf(now);
  const requests = await countDeveloperApiRequest(database, developerApiKeyId, windowStart);
  const resetSeconds = Math.ceil(
    (windowStart.getTime() + WINDOW_MILLISECONDS - now.getTime()) / 1000,
  );
  const headers = {
    "ratelimit-limit": String(DEVELOPER_REQUESTS_PER_MINUTE),
    "ratelimit-remaining": String(Math.max(0, DEVELOPER_REQUESTS_PER_MINUTE - requests)),
    "ratelimit-reset": String(resetSeconds),
  };
  if (requests <= DEVELOPER_REQUESTS_PER_MINUTE) {
    return proceed(headers);
  }
  return stop({
    status: 429,
    code: "rate_limited",
    detail: `Até ${DEVELOPER_REQUESTS_PER_MINUTE} requisições por minuto por chave. Tente de novo em ${resetSeconds} s.`,
    headers: { ...headers, "retry-after": String(resetSeconds) },
  });
}
