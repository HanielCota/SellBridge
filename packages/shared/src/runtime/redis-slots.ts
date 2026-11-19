import { withDeadline } from "./deadline.ts";
import type { RedisBackedQueue } from "./queues.ts";

/**
 * Reserves the next slot of a key atomically, on Redis' clock so every process agrees on "now".
 * KEYS[1] = slot key; ARGV[1] = spacing in ms; returns the wait in ms (0 when the slot is free).
 */
const RESERVE_SLOT_SCRIPT = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local spacing = tonumber(ARGV[1])
local slot = math.max(now, tonumber(redis.call('GET', KEYS[1]) or now))
local nextSlot = slot + spacing
redis.call('SET', KEYS[1], nextSlot, 'PX', math.ceil(nextSlot - now) + 1000)
return math.ceil(slot - now)
`;

const KEY_PREFIX = "sellbridge:rate-slot:";

/** The queue connection retries forever while Redis is down; a reservation must not wait that long. */
const RESERVE_DEADLINE_IN_MS = 1_000;

async function runReservation(queue: RedisBackedQueue, key: string, spacingInMs: number) {
  const client = await queue.getBackend().client;
  return client.runCommand("eval", [RESERVE_SLOT_SCRIPT, "1", key, String(spacingInMs)]);
}

/**
 * Slots shared by every process through Redis (the queue connection they already hold), so a
 * quota per account is respected by the web app and all workers together.
 */
export function createRedisSlotStore(queue: RedisBackedQueue, namespace: string) {
  return {
    async reserve(key: string, spacingInMs: number): Promise<number> {
      if (!Number.isFinite(spacingInMs) || spacingInMs <= 0) {
        throw new RangeError(`spacingInMs must be positive, got ${spacingInMs}`);
      }
      const answer = await withDeadline(
        runReservation(queue, `${KEY_PREFIX}${namespace}:${key}`, Math.ceil(spacingInMs)),
        RESERVE_DEADLINE_IN_MS,
        "Reserva da vez no Redis",
      );
      const waitInMs = Number(answer);
      if (!Number.isFinite(waitInMs) || waitInMs < 0) {
        throw new Error(`Redis slot reservation answered ${String(answer)}`);
      }
      return waitInMs;
    },
  };
}
