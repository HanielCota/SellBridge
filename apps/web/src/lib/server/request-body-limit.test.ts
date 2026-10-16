import { describe, expect, it } from "vitest";
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
});

describe("limitRequestBody", () => {
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
