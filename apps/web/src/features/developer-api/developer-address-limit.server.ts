import type { RateLimitStore } from "@sellbridge/shared/redis-rate-limit-store";
import { proceed, stop, type StepResult } from "@/features/public-api/problem";
import {
  createAuthRateLimitStorage,
  createMemoryRateLimitStore,
} from "@/lib/server/auth-rate-limit";
import { clientAddress } from "@/lib/server/client-address";
import { environment } from "@/lib/server/environment";
import { sharedRateLimitStore } from "@/lib/server/queues";

/**
 * Calls per address per minute, before the key is even looked up: a client sending made-up keys
 * cannot make the database answer without limit. Above the per-developer limit, so a real
 * developer never meets it first.
 */
export const DEVELOPER_REQUESTS_PER_ADDRESS_PER_MINUTE = 300;
const ONE_MINUTE_IN_SECONDS = 60;
const UNKNOWN_ADDRESS = "unknown";

let addressStore: Pick<RateLimitStore, "consume"> | null = null;

function store(): Pick<RateLimitStore, "consume"> {
  if (addressStore !== null) {
    return addressStore;
  }
  addressStore = createAuthRateLimitStorage({
    shared: sharedRateLimitStore("developer-api-address"),
    fallback: createMemoryRateLimitStore(),
    keySecret: environment.BETTER_AUTH_SECRET,
  });
  return addressStore;
}

export async function limitDeveloperAddress(request: Request): Promise<StepResult<null>> {
  const address = clientAddress(request, environment.CLIENT_IP_HEADER) ?? UNKNOWN_ADDRESS;
  const decision = await store().consume(address, {
    window: ONE_MINUTE_IN_SECONDS,
    max: DEVELOPER_REQUESTS_PER_ADDRESS_PER_MINUTE,
  });
  if (decision.allowed) {
    return proceed(null);
  }
  const retryAfter = String(decision.retryAfter ?? ONE_MINUTE_IN_SECONDS);
  return stop({
    status: 429,
    code: "rate_limited",
    detail: `Muitas requisições deste endereço. Tente de novo em ${retryAfter} s.`,
    headers: { "retry-after": retryAfter },
  });
}
