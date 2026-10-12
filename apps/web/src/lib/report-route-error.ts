import { describeError, type ErrorReport } from "./error-diagnostics";

const recent = new Map<string, { id: string; time: number }>();
const pending = new Map<string, Promise<string | null>>();
let windowStarted = 0;
let sent = 0;

/** Report only after hydration, coalescing repeated renders and never throwing into React. */
export async function reportRouteError(error: unknown, route: string): Promise<string | null> {
  try {
    const diagnostic = describeError(error);
    const buildId = import.meta.env.VITE_BUILD_ID ?? "development";
    const fingerprint = JSON.stringify({ ...diagnostic, route, buildId });
    const now = Date.now();
    for (const [key, entry] of recent) {
      if (now - entry.time >= 30_000) recent.delete(key);
    }
    const previous = recent.get(fingerprint);
    if (previous) return previous.id;
    const inFlight = pending.get(fingerprint);
    if (inFlight) return await inFlight;
    if (now - windowStarted >= 60_000) {
      windowStarted = now;
      sent = 0;
    }
    if (sent >= 10) return null;
    sent += 1;
    const report: ErrorReport = {
      ...diagnostic,
      id: crypto.randomUUID(),
      occurredAt: new Date(now).toISOString(),
      route,
      buildId,
    };
    const delivery = completeDelivery(report, fingerprint, now);
    pending.set(fingerprint, delivery);
    return await delivery;
  } catch {
    // Reporting must not hide the original failure or create unhandled rejections.
    return null;
  }
}

async function completeDelivery(
  report: ErrorReport,
  fingerprint: string,
  time: number,
): Promise<string | null> {
  try {
    const id = await deliver(report);
    if (id) recent.set(fingerprint, { id, time });
    return id;
  } finally {
    pending.delete(fingerprint);
  }
}

async function deliver(report: ErrorReport): Promise<string | null> {
  try {
    const response = await fetch("/api/diagnostics/errors", {
      method: "POST",
      credentials: "omit",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(report),
      keepalive: true,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    return report.id;
  } catch {
    return null;
  }
}
