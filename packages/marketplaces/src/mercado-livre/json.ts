/** The source text the reviver gets in Node 22+ (JSON.parse source text access). */
interface ReviverContext {
  readonly source?: string;
}

const INTEGER_TEXT = /^-?\d+$/;

/**
 * Parses a Mercado Livre body keeping integers past 2^53 exact, as their digits. Plain
 * `JSON.parse` rounds 9007199254740993 to ...992, which names another order or seller; the
 * schemas refuse a rounded number, so once ids grow that far every import would stop. Safe
 * integers stay numbers. Returns null for text that is not JSON, like `readJsonBody`.
 */
export function parseMercadoLivreJson(text: string): unknown {
  try {
    const value: unknown = JSON.parse(
      text,
      (_key: string, parsed: unknown, context?: ReviverContext): unknown => {
        const source = context?.source;
        if (
          typeof parsed === "number" &&
          !Number.isSafeInteger(parsed) &&
          source !== undefined &&
          INTEGER_TEXT.test(source)
        ) {
          return source;
        }
        return parsed;
      },
    );
    return value;
  } catch {
    return null;
  }
}

/** The response body through `parseMercadoLivreJson`. */
export async function readMercadoLivreJson(response: Response): Promise<unknown> {
  return parseMercadoLivreJson(await response.text());
}
