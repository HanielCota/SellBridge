/**
 * Carrier reads running at once for one screen: a search may list up to 20 parcels, and a real
 * carrier API throttles bursts from one client.
 */
export const CARRIER_LOOKUP_CONCURRENCY = 4;

function firstRequestPerCode<Request extends { code: string }>(
  requests: readonly Request[],
): Request[] {
  const byCode = new Map<string, Request>();
  for (const request of requests) {
    if (!byCode.has(request.code)) {
      byCode.set(request.code, request);
    }
  }
  return [...byCode.values()];
}

/**
 * Reads each tracking code once (two parcels sharing a code cost one call), with at most
 * `concurrency` reads in flight. The answers come back by code.
 */
export async function lookUpEachCodeOnce<Request extends { code: string }, Result>(
  requests: readonly Request[],
  lookUp: (request: Request) => Promise<Result>,
  concurrency: number = CARRIER_LOOKUP_CONCURRENCY,
): Promise<ReadonlyMap<string, Result>> {
  const queue = firstRequestPerCode(requests);
  const results = new Map<string, Result>();
  let nextIndex = 0;
  const runLane = async (): Promise<void> => {
    for (let request = queue[nextIndex]; request !== undefined; request = queue[nextIndex]) {
      nextIndex += 1;
      // Sequential on purpose: each lane holds one carrier call at a time.
      results.set(request.code, await lookUp(request));
    }
  };
  const laneCount = Math.min(Math.max(1, concurrency), queue.length);
  await Promise.all(Array.from({ length: laneCount }, runLane));
  return results;
}
