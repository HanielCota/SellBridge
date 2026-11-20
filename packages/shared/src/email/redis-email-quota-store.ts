import { withDeadline } from "../runtime/deadline.ts";
import type { RedisBackedQueue } from "../runtime/queues.ts";
import type {
  EmailQuotaReservation,
  EmailQuotaReservationResult,
  EmailQuotaStore,
} from "./email-quota.ts";

/**
 * Counts one e-mail on both counters unless either is full, atomically.
 * KEYS[1] = system counter, KEYS[2] = recipient counter;
 * ARGV[1] = system limit, ARGV[2] = recipient limit, ARGV[3] = counter lifetime in seconds.
 * Returns 0 when counted, 1 when the system counter is full, 2 when the recipient's is.
 */
const RESERVE_EMAIL_SCRIPT = `
if tonumber(redis.call('GET', KEYS[1]) or '0') >= tonumber(ARGV[1]) then return 1 end
if tonumber(redis.call('GET', KEYS[2]) or '0') >= tonumber(ARGV[2]) then return 2 end
redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[3])
redis.call('INCR', KEYS[2])
redis.call('EXPIRE', KEYS[2], ARGV[3])
return 0
`;

/** The queue connection retries forever while Redis is down; a send must not wait that long. */
const REDIS_DEADLINE_IN_MS = 1_000;

const RESULT_BY_ANSWER: Readonly<Record<string, EmailQuotaReservationResult>> = {
  "0": "reserved",
  "1": "system_full",
  "2": "recipient_full",
};

async function runCommand(queue: RedisBackedQueue, name: string, args: string[]): Promise<unknown> {
  const client = await queue.getBackend().client;
  return client.runCommand(name, args);
}

/**
 * The e-mail counters in Redis, through the queue connection a process already holds, so the web
 * app and every worker count on the same numbers.
 */
export function createRedisEmailQuotaStore(queue: RedisBackedQueue): EmailQuotaStore {
  return {
    async reserve(reservation: EmailQuotaReservation) {
      const answer = await withDeadline(
        runCommand(queue, "eval", [
          RESERVE_EMAIL_SCRIPT,
          "2",
          reservation.systemKey,
          reservation.recipientKey,
          String(reservation.systemLimit),
          String(reservation.recipientLimit),
          String(reservation.ttlInSeconds),
        ]),
        REDIS_DEADLINE_IN_MS,
        "Contagem de e-mails no Redis",
      );
      const result = RESULT_BY_ANSWER[String(answer)];
      if (result === undefined) {
        throw new Error(`Redis e-mail quota answered ${String(answer)}`);
      }
      return result;
    },
    async claimOnce(key: string, ttlInSeconds: number) {
      const answer = await withDeadline(
        runCommand(queue, "set", [key, "1", "EX", String(ttlInSeconds), "NX"]),
        REDIS_DEADLINE_IN_MS,
        "Marca do alerta de e-mails no Redis",
      );
      return answer === "OK";
    },
  };
}
