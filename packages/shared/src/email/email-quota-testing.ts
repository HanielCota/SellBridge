import type { EmailQuota, EmailQuotaStore } from "./email-quota.ts";

/** Tests only: the counters in memory, behaving like the Redis store within one process. */
export function createMemoryEmailQuotaStore(): EmailQuotaStore {
  const counters = new Map<string, number>();
  const claimed = new Set<string>();

  return {
    async reserve(reservation) {
      const system = counters.get(reservation.systemKey) ?? 0;
      if (system >= reservation.systemLimit) {
        return "system_full";
      }
      const recipient = counters.get(reservation.recipientKey) ?? 0;
      if (recipient >= reservation.recipientLimit) {
        return "recipient_full";
      }
      counters.set(reservation.systemKey, system + 1);
      counters.set(reservation.recipientKey, recipient + 1);
      return "reserved";
    },
    async claimOnce(key) {
      if (claimed.has(key)) {
        return false;
      }
      claimed.add(key);
      return true;
    },
  };
}

/** Tests only: an allowance that never runs out. */
export const unlimitedEmailQuota: EmailQuota = {
  reserve: async () => ({ allowed: true }),
};
