/**
 * Parses a response body as JSON. A body that is not JSON yields `null`, which callers
 * validate with Zod and turn into a typed error, so the parse failure is never ignored.
 */
export async function readJsonBody(response: Response): Promise<unknown> {
  try {
    const body: unknown = await response.json();
    return body;
  } catch {
    return null;
  }
}

/** Same contract as `readJsonBody`, for text already in hand. */
export function parseJsonText(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch {
    return null;
  }
}
