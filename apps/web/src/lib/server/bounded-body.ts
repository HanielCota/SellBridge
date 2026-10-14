/**
 * Reads a request body as UTF-8 text, stopping at `maxBytes`. Counts the bytes that arrive, not
 * the declared `Content-Length`: a chunked body has none, and `request.text()` would buffer all
 * of it before any size check. `null` means the body was larger than the limit.
 */
export async function readBoundedText(request: Request, maxBytes: number): Promise<string | null> {
  if (Number(request.headers.get("content-length") ?? "0") > maxBytes) return null;
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
