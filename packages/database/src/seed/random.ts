/** Deterministic PRNG (mulberry32) so seeds produce the same data on every run. */
export function createRandom(seed: number) {
  let state = seed >>> 0;

  function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }

  function integerBetween(min: number, max: number): number {
    return Math.floor(next() * (max - min + 1)) + min;
  }

  function pick<TItem>(items: readonly TItem[]): TItem {
    const item = items[Math.floor(next() * items.length)];
    if (item === undefined) {
      throw new Error("pick() chamado com lista vazia");
    }
    return item;
  }

  function chance(probability: number): boolean {
    return next() < probability;
  }

  return { next, integerBetween, pick, chance };
}

export type Random = ReturnType<typeof createRandom>;
