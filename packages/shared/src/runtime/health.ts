import { withDeadline } from "./deadline.ts";
import { logger } from "./logger.ts";

/**
 * One dependency a health probe checks (item 32.d). A critical one failing makes the probe
 * answer 503 so the orchestrator restarts the container; a non-critical one only reports
 * "degraded", since restarting this process would not bring it back.
 */
export interface HealthCheck {
  name: string;
  critical: boolean;
  run: () => Promise<boolean>;
}

export type HealthCheckState = "ok" | "unavailable";

export interface HealthReport {
  httpStatus: 200 | 503;
  body: {
    status: "ok" | "degraded" | "unavailable";
    checks: Record<string, HealthCheckState>;
  };
}

/** Below the usual 5 s probe timeout, so a hanging dependency still gets an answer. */
const DEFAULT_TIMEOUT_MILLISECONDS = 2000;

async function passes(check: HealthCheck, timeoutMilliseconds: number): Promise<boolean> {
  try {
    return await withDeadline(check.run(), timeoutMilliseconds, `Health ${check.name}`);
  } catch (error) {
    logger.warn("health.check_threw", { check: check.name, error });
    return false;
  }
}

/** A critical dependency down is an error (it raises an alert); a non-critical one a warning. */
async function checkState(check: HealthCheck, timeoutMilliseconds: number) {
  if (await passes(check, timeoutMilliseconds)) {
    return "ok";
  }
  const log = check.critical ? logger.error : logger.warn;
  log("health.check_failed", { check: check.name });
  return "unavailable";
}

function overallStatus(checks: readonly HealthCheck[], states: readonly HealthCheckState[]) {
  const failing = checks.filter((_check, index) => states[index] !== "ok");
  if (failing.some((check) => check.critical)) {
    return "unavailable";
  }
  return failing.length > 0 ? "degraded" : "ok";
}

export async function runHealthChecks(
  checks: readonly HealthCheck[],
  options: { timeoutMilliseconds?: number } = {},
): Promise<HealthReport> {
  const timeout = options.timeoutMilliseconds ?? DEFAULT_TIMEOUT_MILLISECONDS;
  const states = await Promise.all(checks.map(async (check) => checkState(check, timeout)));
  const status = overallStatus(checks, states);
  return {
    httpStatus: status === "unavailable" ? 503 : 200,
    body: {
      status,
      checks: Object.fromEntries(
        checks.map((check, index) => [check.name, states[index] ?? "unavailable"]),
      ),
    },
  };
}
