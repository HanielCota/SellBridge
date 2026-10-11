import type { ApiScope } from "@sellbridge/shared/public-api";
import { z } from "zod";

export type ApiMethod = "GET" | "POST" | "PATCH" | "DELETE";

/** The caller as handlers see it: always one organization, already authorized. */
export interface ApiHandlerContext {
  tenantId: string;
  apiKeyId: string;
  requestId: string;
  now: Date;
}

export const noInput = z.object({});
type NoInput = typeof noInput;

/**
 * One operation of the public API, described once: the route runs it, the OpenAPI document is
 * generated from it. Handlers receive validated input and return the response body; they
 * never deal with auth, rate limits, idempotency or error formatting.
 */
export interface ApiEndpoint<
  TParams extends z.ZodType = NoInput,
  TQuery extends z.ZodType = NoInput,
  TBody extends z.ZodType = NoInput,
  TResponse extends z.ZodType = z.ZodType,
> {
  method: ApiMethod;
  /** OpenAPI style, relative to /api/v1: `/listings/{listingId}`. */
  path: string;
  operationId: string;
  tag: string;
  summary: string;
  description?: string;
  /** Scope the key needs; null when any valid key may call it. */
  scope: ApiScope | null;
  /** Path, query and body schemas; `noInput` when the operation takes none. */
  params: TParams;
  query: TQuery;
  body: TBody;
  /** The whole response body (`{ data, ... }`), used for types and the docs. */
  response: TResponse;
  successStatus?: 200 | 201 | 202;
  handle: (input: {
    context: ApiHandlerContext;
    params: z.output<TParams>;
    query: z.output<TQuery>;
    body: z.output<TBody>;
  }) => Promise<z.input<TResponse>>;
}

/** Identity function that keeps the generics inferred at each definition. */
export function defineApiEndpoint<
  TParams extends z.ZodType = NoInput,
  TQuery extends z.ZodType = NoInput,
  TBody extends z.ZodType = NoInput,
  TResponse extends z.ZodType = z.ZodType,
>(
  endpoint: ApiEndpoint<TParams, TQuery, TBody, TResponse>,
): ApiEndpoint<TParams, TQuery, TBody, TResponse> {
  return endpoint;
}

/** What the docs need from an endpoint: everything but the handler, without the generics. */
export interface ApiOperation {
  method: ApiMethod;
  path: string;
  operationId: string;
  tag: string;
  summary: string;
  description?: string;
  scope: ApiScope | null;
  params: z.ZodType;
  query: z.ZodType;
  body: z.ZodType;
  response: z.ZodType;
  successStatus?: 200 | 201 | 202;
}

/** Only POST and PATCH read a JSON body. */
export function acceptsBody(operation: { method: ApiMethod }): boolean {
  return operation.method === "POST" || operation.method === "PATCH";
}

/** POST creates things, so it is the only method that needs an Idempotency-Key. */
export function requiresIdempotencyKey(operation: { method: ApiMethod }): boolean {
  return operation.method === "POST";
}

/** `{ data: T }`: every single-resource response. */
export function dataEnvelope<TData extends z.ZodType>(data: TData) {
  return z.object({ data });
}

export const paginationMetaSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

/** `{ data: T[], pagination }`: every paged list. */
export function pageEnvelope<TItem extends z.ZodType>(item: TItem) {
  return z.object({ data: z.array(item), pagination: paginationMetaSchema });
}

/** Query parameters every paged list accepts. */
export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).describe("Página, a partir de 1."),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Itens por página (1 a 100)."),
});

export function toPaginationMeta(page: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}) {
  return {
    page: page.page,
    pageSize: page.pageSize,
    total: page.total,
    totalPages: page.totalPages,
  };
}
