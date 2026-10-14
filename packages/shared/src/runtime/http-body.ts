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

/**
 * A request body as text, or null when it is larger than `maxBytes`. The declared
 * content-length is checked first, and the stream is read with a running byte count, so a
 * chunked upload without a length (or with a false one) is cut off at the limit instead of
 * being held in memory whole.
 */
export async function readTextWithin(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    return null;
  }
  const reader = request.body?.getReader();
  if (!reader) {
    return "";
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return Buffer.concat(chunks).toString("utf8");
    }
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
}
