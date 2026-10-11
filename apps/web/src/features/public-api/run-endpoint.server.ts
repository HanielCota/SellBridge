import { logger } from "@sellbridge/shared/logger";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ApiCaller } from "./authenticate.server";
import { acceptsBody, type ApiEndpoint, requiresIdempotencyKey } from "./endpoint";
import {
  finishIdempotentRequest,
  type IdempotencyClaim,
  startIdempotentRequest,
} from "./idempotency.server";
import {
  type ApiProblem,
  apiProblemSchema,
  problemFromError,
  problemResponse,
  proceed,
  type StepResult,
} from "./problem";
import {
  admitCaller,
  jsonResponse,
  parseJson,
  parsePart,
  type RequestState,
} from "./request-steps.server";

/** What TanStack Start passes to a server route handler. */
export interface ApiRouteInput {
  request: Request;
  params: Record<string, string>;
}

/** How a request ended; stored as is for Idempotency-Key replays. */
const outcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("data"), status: z.number().int(), body: z.unknown() }),
  z.object({ kind: z.literal("problem"), problem: apiProblemSchema }),
]);
type Outcome = z.infer<typeof outcomeSchema>;

interface ParsedInput<TParams, TQuery, TBody> {
  params: TParams;
  query: TQuery;
  body: TBody;
}

async function parseInput<
  TParams extends z.ZodType,
  TQuery extends z.ZodType,
  TBody extends z.ZodType,
  TResponse extends z.ZodType,
>(
  endpoint: ApiEndpoint<TParams, TQuery, TBody, TResponse>,
  input: ApiRouteInput,
  bodyText: string,
): Promise<StepResult<ParsedInput<z.output<TParams>, z.output<TQuery>, z.output<TBody>>>> {
  const params = parsePart(endpoint.params, input.params, "params");
  if (!params.ok) {
    return params;
  }
  const searchParams = Object.fromEntries(new URL(input.request.url).searchParams);
  const query = parsePart(endpoint.query, searchParams, "query");
  if (!query.ok) {
    return query;
  }
  const json = acceptsBody(endpoint) ? parseJson(bodyText) : proceed({});
  if (!json.ok) {
    return json;
  }
  const body = parsePart(endpoint.body, json.value, "body");
  if (!body.ok) {
    return body;
  }
  return proceed({ params: params.value, query: query.value, body: body.value });
}

/** Runs the handler; any thrown error becomes a problem response with the same shape. */
async function execute<
  TParams extends z.ZodType,
  TQuery extends z.ZodType,
  TBody extends z.ZodType,
  TResponse extends z.ZodType,
>(
  endpoint: ApiEndpoint<TParams, TQuery, TBody, TResponse>,
  caller: ApiCaller,
  state: RequestState,
  input: ParsedInput<z.output<TParams>, z.output<TQuery>, z.output<TBody>>,
): Promise<Outcome> {
  try {
    const body = await endpoint.handle({
      context: {
        tenantId: caller.tenantId,
        apiKeyId: caller.apiKeyId,
        requestId: state.requestId,
        now: state.now,
      },
      ...input,
    });
    return { kind: "data", status: endpoint.successStatus ?? 200, body };
  } catch (error) {
    const problem = problemFromError(error);
    if (problem.status >= 500) {
      logger.error("api.handler_failed", { operation: endpoint.operationId, error });
    }
    return { kind: "problem", problem };
  }
}

function respond(state: RequestState, outcome: Outcome): Response {
  if (outcome.kind === "data") {
    return jsonResponse(state, outcome.status, outcome.body);
  }
  return problemResponse(outcome.problem, state.requestId, state.rateLimitHeaders);
}

function statusOf(outcome: Outcome): number {
  return outcome.kind === "data" ? outcome.status : outcome.problem.status;
}

/**
 * Turns an endpoint definition into a server route handler: authenticate, check the scope,
 * rate limit, validate input, apply Idempotency-Key on POST, run, and format the response.
 */
export function apiRouteHandler<
  TParams extends z.ZodType,
  TQuery extends z.ZodType,
  TBody extends z.ZodType,
  TResponse extends z.ZodType,
>(endpoint: ApiEndpoint<TParams, TQuery, TBody, TResponse>) {
  return async (input: ApiRouteInput): Promise<Response> => {
    const requestId = randomUUID();
    const now = new Date();
    const started = performance.now();
    const response = await runEndpoint(endpoint, input, { requestId, now });
    logger.info("api.request", {
      operation: endpoint.operationId,
      method: endpoint.method,
      status: response.status,
      requestId,
      durationMilliseconds: Math.round(performance.now() - started),
    });
    return response;
  };
}

async function runEndpoint<
  TParams extends z.ZodType,
  TQuery extends z.ZodType,
  TBody extends z.ZodType,
  TResponse extends z.ZodType,
>(
  endpoint: ApiEndpoint<TParams, TQuery, TBody, TResponse>,
  input: ApiRouteInput,
  base: { requestId: string; now: Date },
): Promise<Response> {
  const admitted = await admitCaller(input.request, endpoint.scope, base.now);
  if (!admitted.ok) {
    return problemResponse(admitted.problem, base.requestId);
  }
  const { caller, rateLimitHeaders } = admitted.value;
  const path = new URL(input.request.url).pathname;
  const state: RequestState = { ...base, path, rateLimitHeaders };
  const bodyText = acceptsBody(endpoint) ? await input.request.text() : "";
  const parsed = await parseInput(endpoint, input, bodyText);
  if (!parsed.ok) {
    return problemResponse(parsed.problem, state.requestId, rateLimitHeaders);
  }
  if (!requiresIdempotencyKey(endpoint)) {
    return respond(state, await execute(endpoint, caller, state, parsed.value));
  }
  return runIdempotent({ endpoint, caller, state, input, bodyText, parsed: parsed.value });
}

async function runIdempotent<
  TParams extends z.ZodType,
  TQuery extends z.ZodType,
  TBody extends z.ZodType,
  TResponse extends z.ZodType,
>(run: {
  endpoint: ApiEndpoint<TParams, TQuery, TBody, TResponse>;
  caller: ApiCaller;
  state: RequestState;
  input: ApiRouteInput;
  bodyText: string;
  parsed: ParsedInput<z.output<TParams>, z.output<TQuery>, z.output<TBody>>;
}): Promise<Response> {
  const { state } = run;
  const started = await startIdempotentRequest({
    tenantId: run.caller.tenantId,
    headers: run.input.request.headers,
    method: run.endpoint.method,
    path: state.path,
    body: run.bodyText,
    now: state.now,
  });
  if (!started.ok) {
    return problemResponse(started.problem, state.requestId, state.rateLimitHeaders);
  }
  if (started.value.kind === "replay") {
    return replay(state, started.value.body);
  }
  const claim: IdempotencyClaim = started.value.claim;
  const outcome = await execute(run.endpoint, run.caller, state, run.parsed);
  await finishIdempotentRequest(claim, { status: statusOf(outcome), body: outcome });
  return respond(state, outcome);
}

/** Answers with the first response, marked so the client can tell it was replayed. */
function replay(state: RequestState, stored: unknown): Response {
  const parsed = outcomeSchema.safeParse(stored);
  const outcome: Outcome = parsed.success
    ? parsed.data
    : { kind: "problem", problem: storedOutcomeLost() };
  const response = respond(state, outcome);
  response.headers.set("idempotent-replayed", "true");
  return response;
}

function storedOutcomeLost(): ApiProblem {
  return {
    status: 500,
    code: "internal_error",
    detail: "Não foi possível repetir a resposta original. Use uma nova Idempotency-Key.",
  };
}
