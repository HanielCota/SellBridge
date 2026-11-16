/** A saved answer this young is used as is: commissions and shipping tables change rarely. */
export const QUOTE_FRESH_MILLISECONDS = 24 * 60 * 60 * 1000;

/**
 * When the marketplace does not answer, a saved answer up to this old still beats the published
 * table; past it the screens go back to the estimate.
 */
export const QUOTE_FALLBACK_MILLISECONDS = 7 * 24 * 60 * 60 * 1000;

export interface Quote {
  amount: number;
  readAt: Date;
}

export interface QuoteReading {
  /** Every key with a usable answer: fresh, newly asked or saved within the fallback window. */
  quotes: Map<string, Quote>;
  /** Answers asked now, to save for the next reads. */
  asked: ({ quoteKey: string } & Quote)[];
  /** Keys the marketplace did not answer, with no saved answer young enough to stand in. */
  missing: string[];
}

interface QuoteRequest {
  quoteKeys: readonly string[];
  saved: ReadonlyMap<string, Quote>;
  now: Date;
  /** Asks the marketplace; a rejection means "no answer now". */
  ask: (quoteKey: string) => Promise<number>;
}

function ageOf(quote: Quote, now: Date): number {
  return now.getTime() - quote.readAt.getTime();
}

/**
 * Reads each key from what was saved while it is fresh, asks the marketplace for the rest at
 * once, and falls back to a saved answer up to a week old for any key it does not answer.
 */
export async function readQuotes(request: QuoteRequest): Promise<QuoteReading> {
  const { saved, now } = request;
  const stale = request.quoteKeys.filter((key) => {
    const quote = saved.get(key);
    return quote === undefined || ageOf(quote, now) >= QUOTE_FRESH_MILLISECONDS;
  });
  const answers = await Promise.allSettled(stale.map((key) => request.ask(key)));
  const answerByKey = new Map(stale.map((key, index) => [key, answers[index]]));
  const reading: QuoteReading = { quotes: new Map(), asked: [], missing: [] };
  for (const key of request.quoteKeys) {
    const savedQuote = saved.get(key);
    if (!answerByKey.has(key) && savedQuote !== undefined) {
      reading.quotes.set(key, savedQuote);
      continue;
    }
    const answer = answerByKey.get(key);
    if (answer?.status === "fulfilled") {
      const quote = { amount: answer.value, readAt: now };
      reading.quotes.set(key, quote);
      reading.asked.push({ quoteKey: key, ...quote });
      continue;
    }
    if (savedQuote !== undefined && ageOf(savedQuote, now) < QUOTE_FALLBACK_MILLISECONDS) {
      reading.quotes.set(key, savedQuote);
      continue;
    }
    reading.missing.push(key);
  }
  return reading;
}
