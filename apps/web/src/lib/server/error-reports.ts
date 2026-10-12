import { logger } from "@sellbridge/shared/logger";
import { errorReportSchema, redactDiagnostic } from "../error-diagnostics";

const MAX_BODY_BYTES = 8192;
let windowStarted = 0;
let received = 0;

function response(status: number): Response {
  return new Response(null, { status, headers: { "cache-control": "no-store" } });
}

/** Available even when auth/database fail; same-origin JSON only, with bounded ingestion. */
export async function handleErrorReport(request: Request): Promise<Response> {
  const expectedOrigin = new URL(process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? request.url)
    .origin;
  if (request.headers.get("origin") !== expectedOrigin) return response(403);
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json")
    return response(415);
  const now = Date.now();
  if (now - windowStarted >= 60_000) {
    windowStarted = now;
    received = 0;
  }
  if (received >= 60) return response(429);
  received += 1;
  const reader = request.body?.getReader();
  if (!reader) return response(400);
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return response(413);
      }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks).toString("utf8");
    const parsed = errorReportSchema.safeParse(JSON.parse(body));
    if (!parsed.success) return response(400);
    logger.error("web.route_error", {
      ...parsed.data,
      message: redactDiagnostic(parsed.data.message),
      source: "browser",
      serverBuildId: import.meta.env.VITE_BUILD_ID ?? "development",
    });
    return response(204);
  } catch {
    return response(400);
  } finally {
    reader.releaseLock();
  }
}
