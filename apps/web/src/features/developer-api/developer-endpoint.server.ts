import { recordDeveloperApiRequest } from "@sellbridge/database/repositories";
import type { DeveloperScope } from "@sellbridge/shared/developer-api";
import { logger } from "@sellbridge/shared/logger";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import {
  problemFromError,
  problemResponse,
  proceed,
  type StepResult,
} from "@/features/public-api/problem";
import type { RateLimitHeaders } from "@/features/public-api/rate-limit.server";
import {
  jsonResponse,
  parseJson,
  parsePart,
  readBody,
} from "@/features/public-api/request-steps.server";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import {
  authenticateDeveloperKey,
  type DeveloperCaller,
  requireDeveloperScope,
} from "./developer-authenticate.server";
import { enforceDeveloperRateLimit } from "./developer-rate-limit.server";

/** One read-only operation of the developer API, described once for the route and the manual. */
export interface DeveloperEndpoint<
  TParams extends z.ZodType,
  TQuery extends z.ZodType,
  TResponse extends z.ZodType = z.ZodType,
> {
  /** OpenAPI style, relative to /api/dev/v1: `/organizations/{organizationId}/orders`. */
  path: string;
  operationId: string;
  tag: string;
  summary: string;
  description?: string | undefined;
  /** null: any valid key may call it (`/me`). */
  scope: DeveloperScope | null;
  params: TParams;
  query: TQuery;
  /** The whole response body (`{ data, ... }`), used for types and the manual. */
  response: TResponse;
  handle: (input: {
    caller: DeveloperCaller;
    params: z.output<TParams>;
    query: z.output<TQuery>;
    requestId: string;
    now: Date;
  }) => Promise<z.input<TResponse>>;
}

/**
 * One operation of the developer API that takes a JSON body. Developer keys never change an
 * organization's data; the only body operation creates an entry link (decision of 25/11/2026).
 */
export interface DeveloperBodyEndpoint<TBody extends z.ZodType, TResponse extends z.ZodType> {
  path: string;
  operationId: string;
  tag: string;
  summary: string;
  description?: string | undefined;
  scope: DeveloperScope;
  body: TBody;
  response: TResponse;
  handle: (input: {
    caller: DeveloperCaller;
    body: z.output<TBody>;
    requestId: string;
    now: Date;
  }) => Promise<z.input<TResponse>>;
}

export function defineDeveloperBodyEndpoint<TBody extends z.ZodType, TResponse extends z.ZodType>(
  endpoint: DeveloperBodyEndpoint<TBody, TResponse>,
): DeveloperBodyEndpoint<TBody, TResponse> {
  return endpoint;
}

export function defineDeveloperEndpoint<
  TParams extends z.ZodType,
  TQuery extends z.ZodType,
  TResponse extends z.ZodType,
>(
  endpoint: DeveloperEndpoint<TParams, TQuery, TResponse>,
): DeveloperEndpoint<TParams, TQuery, TResponse> {
  return endpoint;
}

interface RequestBase {
  requestId: string;
  now: Date;
}

interface RouteInput {
  request: Request;
  params: Record<string, string>;
}

interface Admitted {
  caller: DeveloperCaller;
  rateLimitHeaders: RateLimitHeaders;
}

async function admit(
  request: Request,
  scope: DeveloperScope | null,
  now: Date,
): Promise<StepResult<Admitted>> {
  const authenticated = await authenticateDeveloperKey(
    request.headers,
    now,
    environment.DEVELOPER_EMAILS,
  );
  if (!authenticated.ok) {
    return authenticated;
  }
  const authorized = requireDeveloperScope(authenticated.value, scope);
  if (!authorized.ok) {
    return authorized;
  }
  const limited = await enforceDeveloperRateLimit(authorized.value.developerApiKeyId, now);
  if (!limited.ok) {
    return limited;
  }
  return proceed({ caller: authorized.value, rateLimitHeaders: limited.value });
}

/** Runs the handler and turns its result, or its error, into the response. */
async function respond(
  operationId: string,
  context: { request: Request; base: RequestBase; admitted: Admitted; successStatus: number },
  execute: () => Promise<unknown>,
): Promise<Response> {
  const { request, base, admitted, successStatus } = context;
  try {
    const body = await execute();
    const path = new URL(request.url).pathname;
    const state = { ...base, path, rateLimitHeaders: admitted.rateLimitHeaders };
    return jsonResponse(state, successStatus, body);
  } catch (error) {
    const problem = problemFromError(error);
    if (problem.status >= 500) {
      logger.error("developer_api.handler_failed", { operation: operationId, error });
    }
    return problemResponse(problem, base.requestId, admitted.rateLimitHeaders);
  }
}

async function run<TParams extends z.ZodType, TQuery extends z.ZodType>(
  endpoint: DeveloperEndpoint<TParams, TQuery>,
  input: RouteInput,
  base: RequestBase,
  admitted: Admitted,
): Promise<Response> {
  const { caller, rateLimitHeaders } = admitted;
  const params = parsePart(endpoint.params, input.params, "params");
  if (!params.ok) {
    return problemResponse(params.problem, base.requestId, rateLimitHeaders);
  }
  const searchParams = Object.fromEntries(new URL(input.request.url).searchParams);
  const query = parsePart(endpoint.query, searchParams, "query");
  if (!query.ok) {
    return problemResponse(query.problem, base.requestId, rateLimitHeaders);
  }
  const context = { request: input.request, base, admitted, successStatus: 200 };
  return respond(endpoint.operationId, context, async () =>
    endpoint.handle({
      caller,
      params: params.value,
      query: query.value,
      requestId: base.requestId,
      now: base.now,
    }),
  );
}

async function runWithBody<TBody extends z.ZodType, TResponse extends z.ZodType>(
  endpoint: DeveloperBodyEndpoint<TBody, TResponse>,
  request: Request,
  base: RequestBase,
  admitted: Admitted,
): Promise<Response> {
  const { caller, rateLimitHeaders } = admitted;
  const text = await readBody(request);
  if (!text.ok) {
    return problemResponse(text.problem, base.requestId, rateLimitHeaders);
  }
  const json = parseJson(text.value);
  if (!json.ok) {
    return problemResponse(json.problem, base.requestId, rateLimitHeaders);
  }
  const body = parsePart(endpoint.body, json.value, "body");
  if (!body.ok) {
    return problemResponse(body.problem, base.requestId, rateLimitHeaders);
  }
  const context = { request, base, admitted, successStatus: 201 };
  return respond(endpoint.operationId, context, async () =>
    endpoint.handle({ caller, body: body.value, requestId: base.requestId, now: base.now }),
  );
}

/** Usage is recorded for the key's owner to audit; a failure here never fails the request. */
async function recordUse(record: {
  developerApiKeyId: string;
  operation: string;
  status: number;
  durationMilliseconds: number;
}): Promise<void> {
  try {
    await recordDeveloperApiRequest(database, record);
  } catch (error) {
    logger.error("developer_api.usage_not_recorded", { operation: record.operation, error });
  }
}

/**
 * Every developer request: authenticate the key, re-check its creator, check the scope, rate
 * limit, run, then log and record the use.
 */
async function handleDeveloperRequest(
  operation: { operationId: string; scope: DeveloperScope | null },
  request: Request,
  execute: (base: RequestBase, admitted: Admitted) => Promise<Response>,
): Promise<Response> {
  const base = { requestId: randomUUID(), now: new Date() };
  const started = performance.now();
  const admitted = await admit(request, operation.scope, base.now);
  const response = admitted.ok
    ? await execute(base, admitted.value)
    : problemResponse(admitted.problem, base.requestId);
  const durationMilliseconds = Math.round(performance.now() - started);
  logger.info("developer_api.request", {
    operation: operation.operationId,
    status: response.status,
    requestId: base.requestId,
    developerApiKeyId: admitted.ok ? admitted.value.caller.developerApiKeyId : null,
    durationMilliseconds,
  });
  if (admitted.ok) {
    await recordUse({
      developerApiKeyId: admitted.value.caller.developerApiKeyId,
      operation: operation.operationId,
      status: response.status,
      durationMilliseconds,
    });
  }
  return response;
}

/** Turns a developer endpoint into a GET server route handler. */
export function developerRouteHandler<TParams extends z.ZodType, TQuery extends z.ZodType>(
  endpoint: DeveloperEndpoint<TParams, TQuery>,
) {
  return async (input: RouteInput): Promise<Response> =>
    handleDeveloperRequest(endpoint, input.request, async (base, admitted) =>
      run(endpoint, input, base, admitted),
    );
}

/** Turns a developer body endpoint into a POST server route handler. */
export function developerPostRouteHandler<TBody extends z.ZodType, TResponse extends z.ZodType>(
  endpoint: DeveloperBodyEndpoint<TBody, TResponse>,
) {
  return async (input: { request: Request }): Promise<Response> =>
    handleDeveloperRequest(endpoint, input.request, async (base, admitted) =>
      runWithBody(endpoint, input.request, base, admitted),
    );
}
