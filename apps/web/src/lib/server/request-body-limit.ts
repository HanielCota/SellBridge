/**
 * Body caps for the requests no route reads on its own terms. TanStack Start parses a server
 * function's whole body (`request.json()` / `formData()`) before any middleware of ours runs,
 * and Better Auth does the same, so without a cap one 1 GB POST fills the server's memory.
 * The API, webhook and upload routes read their bodies with their own, tighter limits.
 */

/** The largest payload a screen sends: a 2 MiB CSV, whose quotes and line breaks JSON escapes. */
export const MAX_SERVER_FUNCTION_BODY_BYTES = 5 * 1024 * 1024;
/** Sign-in, sign-up and session calls carry a few fields. */
export const MAX_AUTH_BODY_BYTES = 64 * 1024;

const SERVER_FUNCTION_PREFIX = "/_serverFn/";
const AUTH_PREFIX = "/api/auth/";

/** The cap for a request path, or null when the route enforces its own. */
export function bodyLimitFor(pathname: string): number | null {
  if (pathname.startsWith(SERVER_FUNCTION_PREFIX)) {
    return MAX_SERVER_FUNCTION_BODY_BYTES;
  }
  if (pathname.startsWith(AUTH_PREFIX)) {
    return MAX_AUTH_BODY_BYTES;
  }
  return null;
}

export function payloadTooLarge(): Response {
  return new Response("Payload too large", { status: 413 });
}

/** True when the request declares a body larger than `maxBytes` (Content-Length). */
export function declaresMoreThan(request: Request, maxBytes: number): boolean {
  const declared = Number(request.headers.get("content-length") ?? "0");
  return Number.isFinite(declared) && declared > maxBytes;
}

/** Passes the bytes through and errors the stream once more than `maxBytes` went by. */
function countingStream(maxBytes: number): TransformStream<Uint8Array, Uint8Array> {
  let size = 0;
  return new TransformStream({
    transform(chunk, controller) {
      size += chunk.byteLength;
      if (size > maxBytes) {
        controller.error(new RangeError(`Request body larger than ${maxBytes} bytes`));
        return;
      }
      controller.enqueue(chunk);
    },
  });
}

/**
 * The request with its body capped for the server's `fetch`: a 413 when the declared length is
 * over the cap, and otherwise a body that fails as soon as it passes it, which also covers a
 * chunked upload that declares no length at all.
 */
export function limitRequestBody(request: Request): Request | Response {
  const limit = bodyLimitFor(new URL(request.url).pathname);
  if (limit === null || request.body === null) {
    return request;
  }
  if (declaresMoreThan(request, limit)) {
    return payloadTooLarge();
  }
  // A streamed request body needs `duplex: "half"`, which the DOM `RequestInit` type lacks.
  const init: RequestInit & { duplex: "half" } = {
    body: request.body.pipeThrough(countingStream(limit)),
    duplex: "half",
  };
  return new Request(request, init);
}
