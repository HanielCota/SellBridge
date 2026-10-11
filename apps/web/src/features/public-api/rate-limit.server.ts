import { countApiRequest } from "@sellbridge/database/repositories";
import { database } from "@/lib/server/database";
import { proceed, stop, type StepResult } from "./problem";

/** Requests per key per minute. Generous for syncing jobs, low enough to protect the database. */
export const API_REQUESTS_PER_MINUTE = 120;
const WINDOW_MILLISECONDS = 60_000;

/** IETF RateLimit headers, sent on every response so clients can pace themselves. */
export type RateLimitHeaders = Readonly<Record<string, string>>;

function windowStartOf(now: Date): Date {
  return new Date(Math.floor(now.getTime() / WINDOW_MILLISECONDS) * WINDOW_MILLISECONDS);
}

export async function enforceRateLimit(
  apiKeyId: string,
  now: Date,
): Promise<StepResult<RateLimitHeaders>> {
  const windowStart = windowStartOf(now);
  const requests = await countApiRequest(database, apiKeyId, windowStart);
  const resetSeconds = Math.ceil(
    (windowStart.getTime() + WINDOW_MILLISECONDS - now.getTime()) / 1000,
  );
  const headers = {
    "ratelimit-limit": String(API_REQUESTS_PER_MINUTE),
    "ratelimit-remaining": String(Math.max(0, API_REQUESTS_PER_MINUTE - requests)),
    "ratelimit-reset": String(resetSeconds),
  };
  if (requests <= API_REQUESTS_PER_MINUTE) {
    return proceed(headers);
  }
  return stop({
    status: 429,
    code: "rate_limited",
    detail: `Até ${API_REQUESTS_PER_MINUTE} requisições por minuto por chave. Tente de novo em ${resetSeconds} s.`,
    headers: { ...headers, "retry-after": String(resetSeconds) },
  });
}
