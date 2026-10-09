import { notFoundError } from "@sellbridge/shared/errors";
import { describe, expect, it } from "vitest";
import { isRetryableError, marketplaceAuthError, marketplaceError } from "./errors.ts";

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
