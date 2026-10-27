interface CacheEntry<TValue> {
  promise: Promise<TValue>;
  expiresAt: number;
}

interface AsyncCacheOptions<TKey, TValue> {
  load: (key: TKey) => Promise<TValue>;
  maxEntries: number;
  ttlMilliseconds: number | ((value: TValue) => number);
  now?: () => number;
}

/** Bounded process-local reference data cache. Pending reads share one call; errors are retried. */
export function createAsyncCache<TKey, TValue>({
  load,
  maxEntries,
  ttlMilliseconds,
  now = () => Date.now(),
}: AsyncCacheOptions<TKey, TValue>): (key: TKey) => Promise<TValue> {
  const entries = new Map<TKey, CacheEntry<TValue>>();
  return (key) => {
    const cached = entries.get(key);
    if (cached !== undefined && cached.expiresAt > now()) {
      entries.delete(key);
      entries.set(key, cached);
      return cached.promise;
    }
    entries.delete(key);
    const entry: CacheEntry<TValue> = {
      expiresAt: Number.POSITIVE_INFINITY,
      promise: loadEntry(),
    };
    async function loadEntry(): Promise<TValue> {
      // Register the entry before work starts, including a loader that throws synchronously.
      await Promise.resolve();
      try {
        const value = await load(key);
        if (entries.get(key) === entry) {
          const duration =
            typeof ttlMilliseconds === "function" ? ttlMilliseconds(value) : ttlMilliseconds;
          entry.expiresAt = now() + duration;
        }
        return value;
      } catch (error) {
        if (entries.get(key) === entry) entries.delete(key);
        throw error;
      }
    }
    entries.set(key, entry);
    while (entries.size > Math.max(0, maxEntries)) {
      const oldest = entries.keys().next();
      if (oldest.done) break;
      entries.delete(oldest.value);
    }
    return entry.promise;
  };
}
