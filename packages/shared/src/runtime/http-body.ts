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

/** A request or a response: anything with headers and a body stream. */
type MessageWithBody = Pick<Request, "headers" | "body">;

/**
 * The request (or response) body as bytes, reading at most `maxBytes`; null when it is larger.
 * The declared length is only a first check: a chunked body has none, so the stream itself is
 * counted and reading stops at the limit instead of buffering whatever the sender keeps sending.
 */
export async function readBodyWithin(
  request: MessageWithBody,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    return null;
  }
  const reader = request.body?.getReader();
  if (!reader) {
    return new Uint8Array();
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/** A request body as UTF-8 text within `maxBytes` (see `readBodyWithin`); null when larger. */
export async function readTextWithin(request: Request, maxBytes: number): Promise<string | null> {
  const body = await readBodyWithin(request, maxBytes);
  if (body === null) {
    return null;
  }
  return new TextDecoder().decode(body);
}

/**
 * A multipart form read within `maxBytes` (see `readBodyWithin`); null when it is larger. The
 * whole form is never parsed before its size is known.
 */
export async function readFormDataWithin(
  request: Request,
  maxBytes: number,
): Promise<FormData | null> {
  const body = await readBodyWithin(request, maxBytes);
  if (!body) {
    return null;
  }
  const contentType = request.headers.get("content-type") ?? "";
  return new Response(body, { headers: { "content-type": contentType } }).formData();
}

/**
 * True when a parsed JSON value holds half of a UTF-16 pair on its own ("\ud800"). `JSON.parse`
 * accepts it, but Postgres refuses it in jsonb, so storing the value would fail with a 500.
 * `JSON.stringify` writes exactly those halves as `\uXXXX` escapes, never well-formed text.
 * An escape starts after an even run of backslashes: in `"\\\ud800"` the first two are an
 * escaped backslash and the lone half still follows (a one-backslash lookbehind missed it).
 */
const LONE_SURROGATE_ESCAPE = new RegExp(
  String.raw`(?<!\\)(?:\\\\)*\\u[dD][89a-fA-F][0-9a-fA-F]{2}`,
);

export function hasLoneSurrogate(value: unknown): boolean {
  return LONE_SURROGATE_ESCAPE.test(JSON.stringify(value ?? null));
}
