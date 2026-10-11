import { describe, expect, it } from "vitest";
import { z } from "zod";
import { dataEnvelope, noInput, pageQuerySchema, type ApiOperation } from "./endpoint";
import { buildOpenApiDocument } from "./openapi";

const getThing: ApiOperation = {
  method: "GET",
  path: "/things/{thingId}",
  operationId: "getThing",
  tag: "Coisas",
  summary: "Uma coisa",
  scope: "listings:read",
  params: z.object({ thingId: z.uuid() }),
  query: pageQuerySchema,
  body: noInput,
  response: dataEnvelope(z.object({ id: z.uuid(), at: z.iso.datetime() })),
};

const createThing: ApiOperation = {
  method: "POST",
  path: "/things",
  operationId: "createThing",
  tag: "Coisas",
  summary: "Cria",
  scope: "listings:write",
  params: noInput,
  query: noInput,
  body: z.object({ name: z.string().describe("Nome da coisa") }),
  response: dataEnvelope(z.object({ id: z.uuid() })),
  successStatus: 201,
};

const document = buildOpenApiDocument({
  operations: [getThing, createThing],
  serverUrl: "https://app.test/api/v1",
  description: "Teste",
});

describe("buildOpenApiDocument", () => {
  it("documents path and query parameters, with defaults making them optional", () => {
    const operation = document.paths["/things/{thingId}"]?.get;
    expect(operation).toMatchObject({
      operationId: "getThing",
      parameters: [
        { name: "thingId", in: "path", required: true },
        { name: "page", in: "query", required: false },
        { name: "pageSize", in: "query", required: false },
      ],
    });
    expect(JSON.stringify(operation)).toContain("listings:read");
  });

  it("requires Idempotency-Key and documents the body of POST operations", () => {
    const operation = document.paths["/things"]?.post;
    expect(JSON.stringify(operation)).toContain("Idempotency-Key");
    expect(operation).toHaveProperty("requestBody.content.application/json.schema.properties.name");
    expect(operation).toHaveProperty("responses.201");
  });

  it("declares bearer auth and the shared problem response", () => {
    expect(document.components.securitySchemes.apiKey).toMatchObject({ scheme: "bearer" });
    expect(document.components.schemas.Problem.required).toContain("code");
  });
});
