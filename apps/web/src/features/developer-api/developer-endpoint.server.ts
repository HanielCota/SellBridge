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
import { jsonResponse, parsePart } from "@/features/public-api/request-steps.server";
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

export function defineDeveloperEndpoint<
  TParams extends z.ZodType,
  TQuery extends z.ZodType,
  TResponse extends z.ZodType,
>(
  endpoint: DeveloperEndpoint<TParams, TQuery, TResponse>,
): DeveloperEndpoint<TParams, TQuery, TResponse> {
  return endpoint;
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

async function run<TParams extends z.ZodType, TQuery extends z.ZodType>(
  endpoint: DeveloperEndpoint<TParams, TQuery>,
  input: RouteInput,
  base: { requestId: string; now: Date },
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
  try {
    const body = await endpoint.handle({
      caller,
      params: params.value,
      query: query.value,
      requestId: base.requestId,
      now: base.now,
    });
    const path = new URL(input.request.url).pathname;
    return jsonResponse({ ...base, path, rateLimitHeaders }, 200, body);
  } catch (error) {
    const problem = problemFromError(error);
    if (problem.status >= 500) {
      logger.error("developer_api.handler_failed", { operation: endpoint.operationId, error });
    }
    return problemResponse(problem, base.requestId, rateLimitHeaders);
  }
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
 * Turns a developer endpoint into a GET server route handler: authenticate the key, re-check
 * its creator, check the scope, rate limit, validate input, run, and record the use.
 */
export function developerRouteHandler<TParams extends z.ZodType, TQuery extends z.ZodType>(
  endpoint: DeveloperEndpoint<TParams, TQuery>,
) {
  return async (input: RouteInput): Promise<Response> => {
    const base = { requestId: randomUUID(), now: new Date() };
    const started = performance.now();
    const admitted = await admit(input.request, endpoint.scope, base.now);
    const response = admitted.ok
      ? await run(endpoint, input, base, admitted.value)
      : problemResponse(admitted.problem, base.requestId);
    const durationMilliseconds = Math.round(performance.now() - started);
    logger.info("developer_api.request", {
      operation: endpoint.operationId,
      status: response.status,
      requestId: base.requestId,
      developerApiKeyId: admitted.ok ? admitted.value.caller.developerApiKeyId : null,
      durationMilliseconds,
    });
    if (admitted.ok) {
      await recordUse({
        developerApiKeyId: admitted.value.caller.developerApiKeyId,
        operation: endpoint.operationId,
        status: response.status,
        durationMilliseconds,
      });
    }
    return response;
  };
}
