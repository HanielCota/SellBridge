import type { ProblemService } from "../domain/problem-areas.ts";
import { addProblemLogListener, type ProblemLogEntry } from "./logger.ts";
import { type CapturedProblem, captureProblem } from "./problem-capture.ts";

/**
 * For tests: runs `action` and returns the problems the admin Problemas page would record from
 * what it logged, exactly as the recorder captures them.
 */
export async function problemsLoggedBy(
  action: () => unknown,
  service: ProblemService = "worker",
): Promise<CapturedProblem[]> {
  const entries: ProblemLogEntry[] = [];
  const stop = addProblemLogListener((entry) => {
    entries.push(entry);
  });
  try {
    await action();
  } finally {
    stop();
  }
  const occurredAt = new Date();
  return entries.flatMap((entry) => {
    const problem = captureProblem(entry, service, occurredAt);
    return problem === null ? [] : [problem];
  });
}
