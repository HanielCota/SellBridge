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

/** Runs the handler and turns its result, or its error, into the response. */
async function respond(
  operation: { operationId: string; response: z.ZodType },
  context: { request: Request; base: RequestBase; admitted: Admitted; successStatus: number },
  execute: () => Promise<unknown>,
): Promise<Response> {
  const { request, base, admitted, successStatus } = context;
  try {
    const parsed = operation.response.safeParse(await execute());
    if (!parsed.success) {
      logger.error("developer_api.response_invalid", {
        operation: operation.operationId,
        requestId: base.requestId,
        issueCount: parsed.error.issues.length,
      });
      return problemResponse(
        problemFromError(parsed.error),
        base.requestId,
        admitted.rateLimitHeaders,
      );
    }
    const path = new URL(request.url).pathname;
    const state = { ...base, path, rateLimitHeaders: admitted.rateLimitHeaders };
    return jsonResponse(state, successStatus, parsed.data);
  } catch (error) {
    const problem = problemFromError(error);
    if (problem.status >= 500) {
      logger.error("developer_api.handler_failed", { operation: operation.operationId, error });
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
  return respond(endpoint, context, async () =>
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
  return respond(endpoint, context, async () =>
    endpoint.handle({ caller, body: body.value, requestId: base.requestId, now: base.now }),
  );
}

/** Keep a metadata-only audit event when the database cannot store the usage record. */
async function recordUse(record: DeveloperApiRequestRecord, requestId: string): Promise<void> {
  try {
    await recordDeveloperApiRequest(database, record);
  } catch (error) {
    const { developerApiKeyId, operation, status, personalData } = record;
    const delivered = status >= 200 && status < 300;
    logger.error("developer_api.usage_not_recorded", {
      requestId,
      developerApiKeyId,
      operation,
      status,
      personalData,
      organizationId: delivered ? record.organizationId : null,
      resourceId: delivered ? record.resourceId : null,
      errorType: error instanceof Error ? error.name : "Unknown",
    });
  }
}

/**
 * Every developer request: authenticate the key, re-check its creator, check the scope, rate
 * limit, run, then log and record the use (refused calls of a known key too).
 */
async function handleDeveloperRequest(
  operation: {
    operationId: string;
    scope: DeveloperScope | null;
    sendsPersonalData?: ((caller: DeveloperCaller) => boolean) | undefined;
  },
  input: { request: Request; params: Readonly<Record<string, string>> },
  execute: (base: RequestBase, admitted: Admitted) => Promise<Response>,
): Promise<Response> {
  const base = { requestId: randomUUID(), now: new Date() };
  const started = performance.now();
  const { step, caller } = await admit(input.request, operation.scope, base.now);
  const response = step.ok
    ? await execute(base, step.value)
    : problemResponse(step.problem, base.requestId);
  const durationMilliseconds = Math.round(performance.now() - started);
  logger.info("developer_api.request", {
    operation: operation.operationId,
    status: response.status,
    requestId: base.requestId,
    developerApiKeyId: caller?.developerApiKeyId ?? null,
    durationMilliseconds,
  });
  if (caller !== null) {
    const use = describeDeveloperUse({
      params: input.params,
      status: response.status,
      sendsPersonalData: operation.sendsPersonalData?.(caller) ?? false,
    });
    await recordUse(
      {
        developerApiKeyId: caller.developerApiKeyId,
        keyPrefix: caller.prefix,
        operation: operation.operationId,
        status: response.status,
        durationMilliseconds,
        ...use,
      },
      base.requestId,
    );
  }
  return response;
}

/** Turns a developer endpoint into a GET server route handler. */
export function developerRouteHandler<TParams extends z.ZodType, TQuery extends z.ZodType>(
  endpoint: DeveloperEndpoint<TParams, TQuery>,
) {
  return async (input: RouteInput): Promise<Response> =>
    handleDeveloperRequest(endpoint, input, async (base, admitted) =>
      run(endpoint, input, base, admitted),
    );
}

/** Turns a developer body endpoint into a POST server route handler. */
export function developerPostRouteHandler<TBody extends z.ZodType, TResponse extends z.ZodType>(
  endpoint: DeveloperBodyEndpoint<TBody, TResponse>,
) {
  return async (input: { request: Request }): Promise<Response> =>
    handleDeveloperRequest(
      endpoint,
      { request: input.request, params: {} },
      async (base, admitted) => runWithBody(endpoint, input.request, base, admitted),
    );
}
