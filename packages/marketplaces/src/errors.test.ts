import { notFoundError } from "@sellbridge/shared/errors";
import { describe, expect, it } from "vitest";
import {
  isFinalMarketplaceAnswer,
  isRetryableError,
  marketplaceAuthError,
  marketplaceError,
} from "./errors.ts";

describe("isRetryableError", () => {
  it("follows the retryable flag of marketplace errors", () => {
    expect(isRetryableError(marketplaceError("timeout", { retryable: true }))).toBe(true);
    expect(isRetryableError(marketplaceError("inválido", { retryable: false }))).toBe(false);
    expect(isRetryableError(marketplaceAuthError())).toBe(false);
  });

  it("retries every other failure", () => {
    expect(isRetryableError(new Error("falha de rede"))).toBe(true);
    expect(isRetryableError(notFoundError("anúncio não encontrado"))).toBe(true);
  });
});

describe("isFinalMarketplaceAnswer", () => {
  it("treats a marketplace refusal that retrying cannot change as final", () => {
    const refusal = marketplaceError("pedido inexistente", { retryable: false, status: 404 });

    const isFinal = isFinalMarketplaceAnswer(refusal);

    expect(isFinal).toBe(true);
  });

  it.each([
    {
      failure: "a retryable marketplace error",
      error: marketplaceError("429", { retryable: true }),
    },
    { failure: "a refused token", error: marketplaceAuthError() },
    { failure: "an unknown failure", error: new Error("falha de rede") },
  ])("leaves $failure to retry", ({ error }) => {
    const isFinal = isFinalMarketplaceAnswer(error);

    expect(isFinal).toBe(false);
  });
});
