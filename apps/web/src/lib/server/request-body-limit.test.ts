import { describe, expect, it } from "vitest";
import { serve } from "srvx";
import {
  bodyLimitFor,
  limitRequestBody,
  MAX_AUTH_BODY_BYTES,
  MAX_SERVER_FUNCTION_BODY_BYTES,
} from "./request-body-limit";

function post(path: string, body: BodyInit, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${path}`, { method: "POST", body, headers });
}

/** A body sent in chunks with no Content-Length, like `curl --data-binary @- -H chunked`. */
function chunked(path: string, bytes: number): Request {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes));
      controller.close();
    },
  });
  const init: RequestInit & { duplex: "half" } = { method: "POST", body: stream, duplex: "half" };
  return new Request(`http://localhost${path}`, init);
}

describe("bodyLimitFor", () => {
  it("caps server functions and auth, and leaves routes with their own limits alone", () => {
    expect(bodyLimitFor("/_serverFn/abc")).toBe(MAX_SERVER_FUNCTION_BODY_BYTES);
    expect(bodyLimitFor("/api/auth/sign-in/email")).toBe(MAX_AUTH_BODY_BYTES);
    expect(bodyLimitFor("/api/v1/orders")).toBeNull();
    expect(bodyLimitFor("/api/suporte/chamados")).toBeNull();
  });

  // Regression (security audit, 26/10/2026): TanStack Start decodes the path before routing, so
  // "/%5FserverFn/" reached a server function with no cap and the body was parsed whole.
  it.each([
    { path: "/%5FserverFn/abc", limit: MAX_SERVER_FUNCTION_BODY_BYTES },
    { path: "/%5FserverFn/abc%E0", limit: MAX_SERVER_FUNCTION_BODY_BYTES },
    { path: "/api/%61uth/sign-in/email", limit: MAX_AUTH_BODY_BYTES },
  ])("caps $path, a path written with percent-escapes", ({ path, limit }) => {
    const cap = bodyLimitFor(path);

    expect(cap).toBe(limit);
  });
});

describe("limitRequestBody", () => {
  it.each(["/api/auth/sign-in/email", "/api/auth/sign-up/email", "/_serverFn/example"])(
    "passes a real production-server request through %s",
    async (path) => {
      const server = serve({
        hostname: "127.0.0.1",
        port: 0,
        silent: true,
        fetch: async (request) => {
          const limited = limitRequestBody(request);
          if (limited instanceof Response) return limited;
          return Response.json({
            method: limited.method,
            path: new URL(limited.url).pathname,
            contentType: limited.headers.get("content-type"),
            body: await limited.json(),
          });
        },
      });
      try {
        await server.ready();
        const response = await fetch(new URL(path, server.url), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: "production request" }),
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
          method: "POST",
          path,
          contentType: "application/json",
          body: { message: "production request" },
        });
      } finally {
        await server.close(true);
      }
    },
  );

  // Regression: a server function parsed any body whole, so a 1 GB POST filled the memory.
  it("answers 413 when the declared length passes the cap by one byte", () => {
    const request = post("/api/auth/sign-in/email", "{}", {
      "content-length": String(MAX_AUTH_BODY_BYTES + 1),
    });
    const limited = limitRequestBody(request);
    expect(limited instanceof Response && limited.status).toBe(413);
  });

  it("lets a body of exactly the cap through", async () => {
    const limited = limitRequestBody(chunked("/api/auth/x", MAX_AUTH_BODY_BYTES));
    expect(limited).toBeInstanceOf(Request);
    if (!(limited instanceof Request)) return;
    expect((await limited.arrayBuffer()).byteLength).toBe(MAX_AUTH_BODY_BYTES);
  });

  it("fails a chunked body as soon as it passes the cap", async () => {
    const limited = limitRequestBody(chunked("/api/auth/x", MAX_AUTH_BODY_BYTES + 1));
    expect(limited).toBeInstanceOf(Request);
    if (!(limited instanceof Request)) return;
    await expect(limited.arrayBuffer()).rejects.toThrow("larger than");
  });

  it("does not touch requests outside the capped paths", () => {
    const request = post("/api/v1/orders", "{}", { "content-length": "999999999" });
    expect(limitRequestBody(request)).toBe(request);
  });
});
