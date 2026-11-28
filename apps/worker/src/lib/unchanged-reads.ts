import { withDeadline } from "@sellbridge/shared/deadline";
import { logger } from "@sellbridge/shared/logger";
import type { RedisBackedQueue } from "@sellbridge/shared/queues";

/** How many times the order check already read a sale again without anything changing. */
export interface UnchangedReads {
  count(key: string): Promise<number>;
  add(key: string): Promise<void>;
}

const KEY_PREFIX = "sellbridge:order-check-unchanged:";
/** The queue connection retries forever while Redis is down; the check must not wait that long. */
const REDIS_DEADLINE_IN_MS = 1_000;
/** KEYS[1] = counter key; ARGV[1] = lifetime in ms, renewed on each count. */
const ADD_SCRIPT = `
local total = redis.call('INCR', KEYS[1])
redis.call('PEXPIRE', KEYS[1], ARGV[1])
return total
`;

async function runCommand(queue: RedisBackedQueue, name: string, args: string[]) {
  const client = await queue.getBackend().client;
  return withDeadline(client.runCommand(name, args), REDIS_DEADLINE_IN_MS, "Contador no Redis");
}

/**
 * Counters shared by every worker through Redis, each kept as long as the check window. Redis
 * being down never fails a check: the sale is just read again, as before.
 */
export function createRedisUnchangedReads(
  queue: RedisBackedQueue,
  lifetimeInMs: number,
): UnchangedReads {
  return {
    async count(key) {
      try {
        const answer = Number(await runCommand(queue, "get", [`${KEY_PREFIX}${key}`]));
        return Number.isFinite(answer) ? answer : 0;
      } catch (error) {
        logger.warn("order.check_unchanged_count_unavailable", { error });
        return 0;
      }
    },
    async add(key) {
      try {
        await runCommand(queue, "eval", [
          ADD_SCRIPT,
          "1",
          `${KEY_PREFIX}${key}`,
          String(lifetimeInMs),
        ]);
      } catch (error) {
        logger.warn("order.check_unchanged_add_unavailable", { error });
      }
    },
  };
}
