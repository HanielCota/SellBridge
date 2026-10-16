import { AppError, validationError } from "@sellbridge/shared/errors";
import { notFound, redirect } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { UNEXPECTED_ERROR_MESSAGE } from "@/lib/errors";
import { toUserFacingError } from "./user-facing-error";

/** What TanStack Start throws when a server function's validator rejects the input. */
function rejectedInput(schema: z.ZodType, input: unknown): Error {
  const result = schema.safeParse(input);
  if (result.success) {
    throw new Error("expected the input to be rejected");
  }
  return new Error(JSON.stringify(result.error.issues, undefined, 2));
}

describe("toUserFacingError", () => {
  it("keeps an error the app raised on purpose", () => {
    const error = validationError("CEP não encontrado. Confira o número digitado.");
    expect(toUserFacingError(error)).toEqual({ error, isUnexpected: false });
  });

  it("turns rejected input into the first message written in the schema", () => {
    const schema = z.object({ street: z.string().min(1, "Informe a rua") });
    const result = toUserFacingError(rejectedInput(schema, { street: "" }));
    expect(result.isUnexpected).toBe(false);
    expect(result.error).toBeInstanceOf(AppError);
    expect(result.error).toMatchObject({ message: "Informe a rua" });
  });

  it("hides a bug behind the generic message", () => {
    const result = toUserFacingError(
      new TypeError("Cannot read properties of undefined (reading 'replace')"),
    );
    expect(result.isUnexpected).toBe(true);
    expect(result.error).toMatchObject({ message: UNEXPECTED_ERROR_MESSAGE });
  });

  it("hides a plain error whose message only looks like JSON", () => {
    const result = toUserFacingError(new Error("[not json"));
    expect(result.isUnexpected).toBe(true);
  });

  it("hides something thrown that is not an Error", () => {
    expect(toUserFacingError("boom").isUnexpected).toBe(true);
  });

  it("lets router redirects and not-found through", () => {
    const redirection = redirect({ to: "/onboarding" });
    const missing = notFound();
    expect(toUserFacingError(redirection)).toEqual({ error: redirection, isUnexpected: false });
    expect(toUserFacingError(missing)).toEqual({ error: missing, isUnexpected: false });
  });
});
