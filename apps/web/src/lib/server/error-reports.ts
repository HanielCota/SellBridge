import { logger } from "@sellbridge/shared/logger";
import { z } from "zod";
import { errorReportSchema, redactDiagnostic } from "../error-diagnostics";

const MAX_BODY_BYTES = 8192;
const WINDOW_MILLISECONDS = 60_000;
/** Reports one client may send per minute: a crash loop in one browser, not a flood. */
const PER_CLIENT = 30;
/** Every client together per minute, so made-up addresses cannot write the log without end. */
const TOTAL = 600;

let windowStarted = 0;
let received = 0;
let byClient = new Map<string, number>();

/**
 * The variables this receiver reads, validated on their own and leniently: it must keep working
 * when the app's environment fails to load (that failure is one of the errors it reports), so a
 * missing or malformed value falls back instead of throwing.
 */
const headerNameSchema = z.string().trim().toLowerCase().min(1);
const urlSchema = z.url();

function validUrl(value: string | undefined): string | undefined {
  const parsed = urlSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function reportEnvironment() {
  const header = headerNameSchema.safeParse(process.env.CLIENT_IP_HEADER);
  return {
    CLIENT_IP_HEADER: header.success ? header.data : "x-forwarded-for",
    APP_URL: validUrl(process.env.APP_URL),
    BETTER_AUTH_URL: validUrl(process.env.BETTER_AUTH_URL),
  };
}

/**
 * The client a report comes from: the address the proxy forwards (the header Better Auth also
 * reads, `CLIENT_IP_HEADER`), its first hop. Reports with none share one bucket.
 */
function clientKey(request: Request): string {
  const header = reportEnvironment().CLIENT_IP_HEADER;
  const first = request.headers.get(header)?.split(",")[0]?.trim();
  return first === undefined || first === "" ? "unknown" : first;
}

/**
 * Counts the report against its client and the total; false once either is spent. The window
 * restarts every minute, which also forgets idle clients.
 */
function admit(request: Request, now: number): boolean {
  if (now - windowStarted >= WINDOW_MILLISECONDS) {
    windowStarted = now;
    received = 0;
    byClient = new Map();
  }
  const key = clientKey(request);
  const fromClient = byClient.get(key) ?? 0;
  if (received >= TOTAL || fromClient >= PER_CLIENT) {
    return false;
  }
  received += 1;
  byClient.set(key, fromClient + 1);
  return true;
}

function response(status: number): Response {
  return new Response(null, { status, headers: { "cache-control": "no-store" } });
}

/** Available even when auth/database fail; same-origin JSON only, with bounded ingestion. */
export async function handleErrorReport(request: Request): Promise<Response> {
  const { APP_URL, BETTER_AUTH_URL } = reportEnvironment();
  const expectedOrigin = new URL(APP_URL ?? BETTER_AUTH_URL ?? request.url).origin;
  if (request.headers.get("origin") !== expectedOrigin) return response(403);
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json")
    return response(415);
  if (!admit(request, Date.now())) return response(429);
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
