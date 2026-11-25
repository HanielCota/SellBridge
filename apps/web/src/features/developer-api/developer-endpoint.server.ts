import {
  type DeveloperApiRequestRecord,
  recordDeveloperApiRequest,
} from "@sellbridge/database/repositories";
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
import { limitDeveloperAddress } from "./developer-address-limit.server";
import { enforceDeveloperRateLimit } from "./developer-rate-limit.server";
import { describeDeveloperUse } from "./developer-usage";

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
  /** Whether a successful answer to this caller carries buyer personal data, for the usage trail. */
  sendsPersonalData?: ((caller: DeveloperCaller) => boolean) | undefined;
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

/** The outcome, and the key when it was resolved: refused calls of a known key are recorded too. */
interface Admission {
  step: StepResult<Admitted>;
  caller: DeveloperCaller | null;
}

async function admit(
  request: Request,
  scope: DeveloperScope | null,
  now: Date,
): Promise<Admission> {
  const addressAllowed = await limitDeveloperAddress(request);
  if (!addressAllowed.ok) {
    return { step: addressAllowed, caller: null };
  }
  const authenticated = await authenticateDeveloperKey(
    request.headers,
    now,
    environment.DEVELOPER_EMAILS,
  );
  if (!authenticated.ok) {
    return { step: authenticated, caller: null };
  }
  const caller = authenticated.value;
  const authorized = requireDeveloperScope(caller, scope);
  if (!authorized.ok) {
    return { step: authorized, caller };
  }
  const limited = await enforceDeveloperRateLimit(caller, now);
  if (!limited.ok) {
    return { step: limited, caller };
  }
  return { step: proceed({ caller, rateLimitHeaders: limited.value }), caller };
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
async function recordUse(record: DeveloperApiRequestRecord): Promise<void> {
  try {
    await recordDeveloperApiRequest(database, record);
  } catch (error) {
    logger.error("developer_api.usage_not_recorded", { operation: record.operation, error });
  }
}

/**
 * Turns a developer endpoint into a GET server route handler: authenticate the key, re-check
 * its creator, check the scope, rate limit, validate input, run, and record the use (refused calls of a known key too).
 */
export function developerRouteHandler<TParams extends z.ZodType, TQuery extends z.ZodType>(
  endpoint: DeveloperEndpoint<TParams, TQuery>,
) {
  return async (input: RouteInput): Promise<Response> => {
    const base = { requestId: randomUUID(), now: new Date() };
    const started = performance.now();
    const { step, caller } = await admit(input.request, endpoint.scope, base.now);
    const response = step.ok
      ? await run(endpoint, input, base, step.value)
      : problemResponse(step.problem, base.requestId);
    const durationMilliseconds = Math.round(performance.now() - started);
    logger.info("developer_api.request", {
      operation: endpoint.operationId,
      status: response.status,
      requestId: base.requestId,
      developerApiKeyId: caller?.developerApiKeyId ?? null,
      durationMilliseconds,
    });
    if (caller !== null) {
      const use = describeDeveloperUse({
        params: input.params,
        status: response.status,
        sendsPersonalData: endpoint.sendsPersonalData?.(caller) ?? false,
      });
      await recordUse({
        developerApiKeyId: caller.developerApiKeyId,
        keyPrefix: caller.prefix,
        operation: endpoint.operationId,
        status: response.status,
        durationMilliseconds,
        ...use,
      });
    }
    return response;
  };
}
