import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/marketplaces", () => ({ tokenCipher: {} }));
vi.mock("@/lib/server/environment", () => ({
  environment: { APP_URL: "https://app.sellbridge.test/", DEVELOPER_EMAILS: [] },
}));

const { buildDeveloperOpenApiDocument, developerDocsPageResponse } =
  await import("./developer-docs.server");
const { DEVELOPER_ENDPOINTS } = await import("./endpoints/index.server");

const document = buildDeveloperOpenApiDocument();

function operationAt(path: string) {
  const operation = document.paths[path]?.get;
  if (operation === undefined || typeof operation !== "object" || operation === null) {
    throw new Error(`no GET documented at ${path}`);
  }
  return operation;
}

describe("developer API manual", () => {
  it("documents every developer endpoint once", () => {
    const paths = [...DEVELOPER_ENDPOINTS.map((endpoint) => endpoint.path), "/entry-links"];

    expect(new Set(paths).size).toBe(paths.length);
    expect(Object.keys(document.paths).toSorted()).toEqual(paths.toSorted());
  });

  it("points requests at the developer API with developer keys", () => {
    const server = document.servers[0]?.url;

    expect(server).toBe("https://app.sellbridge.test/api/dev/v1");
    expect(document.components.securitySchemes.apiKey.bearerFormat).toBe("sb_dev_...");
  });

  it("lists the organization and the order as path parameters of a reused route", () => {
    const operation = operationAt("/organizations/{organizationId}/orders/{orderId}");

    expect(operation).toMatchObject({
      parameters: [
        { name: "organizationId", in: "path", required: true },
        { name: "orderId", in: "path", required: true },
      ],
    });
  });

  it("names the scope each route needs with its label", () => {
    const operation = operationAt("/suppliers");

    expect(operation).toMatchObject({
      description: expect.stringContaining("Escopo: `suppliers:read` (Fornecedores"),
    });
  });

  it("documents the entry link as a POST without an idempotency key", () => {
    const operation = document.paths["/entry-links"]?.post;

    expect(operation).toMatchObject({ responses: { "201": expect.any(Object) } });
    expect(JSON.stringify(operation)).not.toContain("Idempotency-Key");
  });

  it("embeds the document without letting it close the script tag", async () => {
    const page = await developerDocsPageResponse().text();

    expect(page).toContain('<script id="api-reference" type="application/json">');
    expect(page.match(/<\/script>/g)).toHaveLength(2);
  });

  it("only runs the manual script when the CDN file is the one that was checked", async () => {
    const response = developerDocsPageResponse();
    const page = await response.text();

    expect(page).toMatch(/<script src="[^"]+" integrity="sha384-[^"]+" crossorigin="anonymous">/);
    expect(response.headers.get("content-security-policy")).toContain(
      "script-src https://cdn.jsdelivr.net",
    );
  });

  it("warns that ticket messages may carry the buyer's personal data", () => {
    expect(document.info.description).toContain("mensagens dos chamados");
  });

  it("escapes a closing script tag that reaches the embedded document", async () => {
    vi.resetModules();
    vi.doMock("@/lib/server/environment", () => ({
      environment: { APP_URL: "https://app.sellbridge.test/</script><b>x", DEVELOPER_EMAILS: [] },
    }));
    const docs = await import("./developer-docs.server");

    const page = await docs.developerDocsPageResponse().text();

    expect(page.match(/<\/script>/g)).toHaveLength(2);
    expect(page).toContain("\\u003c/script>");
  });
});
