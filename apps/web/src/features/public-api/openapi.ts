import { API_SCOPE_LABELS } from "@sellbridge/shared/public-api";
import { z } from "zod";
import { acceptsBody, type ApiOperation, requiresIdempotencyKey } from "./endpoint";
import { API_ERROR_CODES } from "./problem";

type JsonSchema = Record<string, unknown>;
type PublicScope = NonNullable<ApiOperation["scope"]>;

/** An operation as the document needs it; each API brings its own scopes. */
export type DocumentedOperation<TScope extends string> = Omit<ApiOperation, "scope"> & {
  scope: TScope | null;
};

/** What differs between the organizations' API and the developer API in the document. */
export interface OpenApiSettings<TScope extends string> {
  title: string;
  bearerFormat: string;
  scopeLabel: (scope: TScope) => string;
  /** Whether POST operations take an `Idempotency-Key` header. */
  idempotentPosts: boolean;
}

export const PUBLIC_API_SETTINGS: OpenApiSettings<PublicScope> = {
  title: "SellBridge API",
  bearerFormat: "sb_live_...",
  scopeLabel: (scope) => API_SCOPE_LABELS[scope],
  idempotentPosts: true,
};

function toSchema(schema: z.ZodType, io: "input" | "output"): JsonSchema {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    io,
    unrepresentable: "any",
  });
  return rest;
}

/** Each field of a z.object becomes one OpenAPI parameter; anything else has none. */
function parametersOf(schema: z.ZodType, location: "path" | "query"): JsonSchema[] {
  // The developer API puts `{ organizationId }` in front of reused paths with `.and()`.
  if (schema instanceof z.ZodIntersection) {
    const { left, right } = schema.def;
    if (left instanceof z.ZodType && right instanceof z.ZodType) {
      return [...parametersOf(left, location), ...parametersOf(right, location)];
    }
    return [];
  }
  if (!(schema instanceof z.ZodObject)) {
    return [];
  }
  const fields: [string, unknown][] = Object.entries(schema.shape);
  return fields.flatMap(([name, field]) => {
    if (!(field instanceof z.ZodType)) {
      return [];
    }
    return [
      {
        name,
        in: location,
        required: location === "path" || !field.safeParse(undefined).success,
        ...(field.description ? { description: field.description } : {}),
        schema: toSchema(field, "input"),
      },
    ];
  });
}

function hasFields(schema: z.ZodType): boolean {
  return !(schema instanceof z.ZodObject) || Object.keys(schema.shape).length > 0;
}

const IDEMPOTENCY_HEADER = {
  name: "Idempotency-Key",
  in: "header",
  required: true,
  description:
    "Valor único por operação (um UUID, por exemplo). Repetir a mesma requisição com a mesma chave devolve a primeira resposta em vez de executar de novo.",
  schema: { type: "string", minLength: 8, maxLength: 255 },
};

const problemResponse = { $ref: "#/components/responses/Problem" };

function errorResponses(
  operation: Pick<ApiOperation, "params" | "method">,
  idempotentPosts: boolean,
) {
  const needsKey = idempotentPosts && requiresIdempotencyKey(operation);
  return {
    "400": problemResponse,
    "401": problemResponse,
    "403": problemResponse,
    ...(parametersOf(operation.params, "path").length > 0 ? { "404": problemResponse } : {}),
    ...(needsKey ? { "409": problemResponse } : {}),
    "422": problemResponse,
    "429": problemResponse,
  };
}

function operationObject<TScope extends string>(
  operation: DocumentedOperation<TScope>,
  settings: OpenApiSettings<TScope>,
) {
  const needsKey = settings.idempotentPosts && requiresIdempotencyKey(operation);
  const parameters = [
    ...parametersOf(operation.params, "path"),
    ...parametersOf(operation.query, "query"),
    ...(needsKey ? [IDEMPOTENCY_HEADER] : []),
  ];
  const scopeNote =
    operation.scope === null
      ? "Qualquer chave válida."
      : `Escopo: \`${operation.scope}\` (${settings.scopeLabel(operation.scope)}).`;
  return {
    operationId: operation.operationId,
    tags: [operation.tag],
    summary: operation.summary,
    description: [operation.description, scopeNote].filter(Boolean).join("\n\n"),
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(acceptsBody(operation) && hasFields(operation.body)
      ? {
          requestBody: {
            required: true,
            content: { "application/json": { schema: toSchema(operation.body, "input") } },
          },
        }
      : {}),
    responses: {
      [String(operation.successStatus ?? 200)]: {
        description: "Sucesso",
        content: { "application/json": { schema: toSchema(operation.response, "output") } },
      },
      ...errorResponses(operation, settings.idempotentPosts),
    },
  };
}

const problemSchema = {
  type: "object",
  description: "Erro no formato RFC 9457 (application/problem+json).",
  required: ["type", "title", "status", "code", "detail", "requestId"],
  properties: {
    type: { type: "string" },
    title: { type: "string" },
    status: { type: "integer" },
    code: { type: "string", enum: [...API_ERROR_CODES] },
    detail: { type: "string", description: "Explicação para quem está integrando." },
    requestId: { type: "string", description: "Informe ao suporte para rastrear a requisição." },
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: { path: { type: "string" }, message: { type: "string" } },
      },
    },
  },
};

/** The OpenAPI 3.1 document of every operation of one API. */
export function buildOpenApiDocument<TScope extends string>(input: {
  operations: readonly DocumentedOperation<TScope>[];
  serverUrl: string;
  description: string;
  settings: OpenApiSettings<TScope>;
}) {
  const { settings } = input;
  const paths: Record<string, Record<string, unknown>> = {};
  for (const operation of input.operations) {
    paths[operation.path] = {
      ...paths[operation.path],
      [operation.method.toLowerCase()]: operationObject(operation, settings),
    };
  }
  return {
    openapi: "3.1.0",
    info: { title: settings.title, version: "1.0.0", description: input.description },
    servers: [{ url: input.serverUrl }],
    security: [{ apiKey: [] }],
    tags: [...new Set(input.operations.map((operation) => operation.tag))].map((name) => ({
      name,
    })),
    paths,
    components: {
      securitySchemes: {
        apiKey: { type: "http", scheme: "bearer", bearerFormat: settings.bearerFormat },
      },
      schemas: { Problem: problemSchema },
      responses: {
        Problem: {
          description: "Erro (veja `code` e `detail`).",
          content: {
            "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } },
          },
        },
      },
    },
  };
}
