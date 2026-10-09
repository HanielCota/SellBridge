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
