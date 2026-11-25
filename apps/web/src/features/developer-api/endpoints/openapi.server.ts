import { z } from "zod";
import { noInput } from "@/features/public-api/endpoint";
import { buildDeveloperOpenApiDocument } from "../developer-docs.server";
import { defineDeveloperEndpoint } from "../developer-endpoint.server";

/** The manual for the AI of another project, read with its own key. */
export const getDeveloperOpenApi = defineDeveloperEndpoint({
  path: "/openapi.json",
  operationId: "getDeveloperOpenApi",
  tag: "Chave",
  summary: "Manual da API (OpenAPI)",
  scope: null,
  params: noInput,
  query: noInput,
  response: z.record(z.string(), z.unknown()),
  handle: async () => buildDeveloperOpenApiDocument(),
});
