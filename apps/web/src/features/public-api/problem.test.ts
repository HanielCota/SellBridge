import { conflictError, notFoundError, validationError } from "@sellbridge/shared/errors";
import { describe, expect, it } from "vitest";
import { problemFromError, problemResponse } from "./problem";

describe("problemFromError", () => {
  it("keeps the message of domain errors and maps their status", () => {
    expect(problemFromError(notFoundError("Anúncio não encontrado"))).toEqual({
      status: 404,
      code: "not_found",
      detail: "Anúncio não encontrado",
    });
    expect(problemFromError(conflictError("Já existe"))).toMatchObject({
      status: 409,
      code: "conflict",
    });
  });

  it("turns validation issues into field issues", () => {
    expect(problemFromError(validationError("Inválido", ["preço baixo"]))).toEqual({
      status: 422,
      code: "validation_failed",
      detail: "Inválido",
      issues: [{ path: "", message: "preço baixo" }],
    });
  });

  it("hides the details of unexpected errors", () => {
    const problem = problemFromError(new Error("connection string with password"));
    expect(problem).toMatchObject({ status: 500, code: "internal_error" });
    expect(problem.detail).not.toContain("password");
  });
});

describe("problemResponse", () => {
  it("answers RFC 9457 JSON with the request id and extra headers", async () => {
    const response = problemResponse(
      { status: 429, code: "rate_limited", detail: "Calma", headers: { "retry-after": "5" } },
      "request-1",
      { "ratelimit-limit": "120" },
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(response.headers.get("retry-after")).toBe("5");
    expect(response.headers.get("ratelimit-limit")).toBe("120");
    expect(response.headers.get("x-request-id")).toBe("request-1");
    expect(await response.json()).toMatchObject({
      status: 429,
      code: "rate_limited",
      detail: "Calma",
      requestId: "request-1",
    });
  });
});
