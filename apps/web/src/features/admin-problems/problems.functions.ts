import {
  type ProblemDetail,
  getProblemEvent,
  listProblemEvents,
  setProblemResolved,
} from "@sellbridge/database/repositories";
import { notFoundError } from "@sellbridge/shared/errors";
import {
  PROBLEM_PERIOD_HOURS,
  problemIdSchema,
  problemPageRequestSchema,
  setProblemResolvedSchema,
} from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { database } from "@/lib/server/database";
import { staffMiddleware } from "@/lib/server/middleware";
import { decodeProblemCursor, encodeProblemCursor } from "./problem-cursor";

const PAGE_SIZE = 25;
const HOUR_MILLISECONDS = 60 * 60 * 1000;
const NOT_FOUND_MESSAGE = "Este problema não existe mais: some depois de 30 dias sem acontecer.";

/** The log event, the ids and the stored fields as indented JSON, for the developer to read or copy. */
function technicalDetailsOf(problem: ProblemDetail, context: Record<string, unknown>): string {
  const details = {
    event: problem.event,
    tenantId: problem.tenantId,
    storeConnectionId: problem.storeConnectionId,
    listingTargetId: problem.listingTargetId,
    context,
  };
  return JSON.stringify(details, null, 2);
}

/**
 * `/admin/problemas`: errors with their context are for the people who fix them, so only roles
 * with `audit.view` (admins) read or change them, checked on every call.
 */
export const adminListProblems = createServerFn({ method: "GET" })
  .middleware([staffMiddleware("audit.view")])
  .validator(problemPageRequestSchema)
  .handler(async ({ data }) => {
    const since = new Date(Date.now() - PROBLEM_PERIOD_HOURS[data.period] * HOUR_MILLISECONDS);
    const page = await listProblemEvents(database, {
      status: data.status,
      area: data.area,
      since,
      cursor: decodeProblemCursor(data.cursor),
      limit: PAGE_SIZE,
    });
    return { items: page.items, nextCursor: encodeProblemCursor(page.nextCursor) };
  });

export const adminGetProblem = createServerFn({ method: "GET" })
  .middleware([staffMiddleware("audit.view")])
  .validator(problemIdSchema)
  .handler(async ({ data }) => {
    const problem = await getProblemEvent(database, data.problemId);
    if (problem === null) {
      throw notFoundError(NOT_FOUND_MESSAGE);
    }
    const { context, ...summary } = problem;
    return { ...summary, technicalDetails: technicalDetailsOf(problem, context) };
  });

export const adminSetProblemResolved = createServerFn({ method: "POST" })
  .middleware([staffMiddleware("audit.view")])
  .validator(setProblemResolvedSchema)
  .handler(async ({ data, context }) => {
    const updated = await setProblemResolved(database, {
      id: data.problemId,
      resolvedById: data.resolved ? context.userId : null,
      now: new Date(),
    });
    if (!updated) {
      throw notFoundError(NOT_FOUND_MESSAGE);
    }
    return { resolved: data.resolved };
  });
