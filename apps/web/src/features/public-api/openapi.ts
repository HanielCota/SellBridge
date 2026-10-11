import { API_SCOPE_LABELS } from "@sellbridge/shared/public-api";
import { z } from "zod";
import { acceptsBody, type ApiOperation, requiresIdempotencyKey } from "./endpoint";
import { API_ERROR_CODES } from "./problem";

type JsonSchema = Record<string, unknown>;

function toSchema(schema: z.ZodType, io: "input" | "output"): JsonSchema {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    io,
    unrepresentable: "any",
  });
  return rest;
}

/** Each field of a z.object becomes one OpenAPI parameter; anything else has none. */
function parametersOf(schema: z.ZodType, location: "path" | "query") {
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

function errorResponses(operation: ApiOperation) {
  return {
    "400": problemResponse,
    "401": problemResponse,
    "403": problemResponse,
    ...(operation.params instanceof z.ZodObject && hasFields(operation.params)
      ? { "404": problemResponse }
      : {}),
    ...(requiresIdempotencyKey(operation) ? { "409": problemResponse } : {}),
    "422": problemResponse,
    "429": problemResponse,
  };
}

function operationObject(operation: ApiOperation) {
  const parameters = [
    ...parametersOf(operation.params, "path"),
    ...parametersOf(operation.query, "query"),
    ...(requiresIdempotencyKey(operation) ? [IDEMPOTENCY_HEADER] : []),
  ];
  const scopeNote =
    operation.scope === null
      ? "Qualquer chave válida."
      : `Escopo: \`${operation.scope}\` (${API_SCOPE_LABELS[operation.scope]}).`;
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
      ...errorResponses(operation),
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

/** The OpenAPI 3.1 document of every operation, served at /api/v1/openapi.json. */
export function buildOpenApiDocument(input: {
  operations: readonly ApiOperation[];
  serverUrl: string;
  description: string;
}) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const operation of input.operations) {
    paths[operation.path] = {
      ...paths[operation.path],
      [operation.method.toLowerCase()]: operationObject(operation),
    };
  }
  return {
    openapi: "3.1.0",
    info: { title: "SellBridge API", version: "1.0.0", description: input.description },
    servers: [{ url: input.serverUrl }],
    security: [{ apiKey: [] }],
    tags: [...new Set(input.operations.map((operation) => operation.tag))].map((name) => ({
      name,
    })),
    paths,
    components: {
      securitySchemes: {
        apiKey: { type: "http", scheme: "bearer", bearerFormat: "sb_live_..." },
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
