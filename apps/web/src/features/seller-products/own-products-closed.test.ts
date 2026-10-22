import { logger } from "@sellbridge/shared/logger";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertOwnProductsClosed } from "./own-products-closed";

const TENANT_ID = "00000000-0000-4000-8000-000000000001";

afterEach(() => {
  vi.restoreAllMocks();
});

// MVP (coordinator decision, 2026-10-22): creating, editing and uploading own products is closed.
describe("assertOwnProductsClosed", () => {
  it.each(["save", "activate", "duplicate", "image_upload"] as const)(
    "refuses the %s action on the server and logs it",
    async (action) => {
      const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
      expect(() => assertOwnProductsClosed(action, TENANT_ID)).toThrow(
        expect.objectContaining({
          code: "FORBIDDEN",
          message: expect.not.stringMatching(/recebido/i),
        }),
      );
      // The log, not the screen, names what was received and what was expected.
      expect(warn).toHaveBeenCalledWith("seller_products.closed", {
        action,
        tenantId: TENANT_ID,
        received: "seller",
        expected: "supplier",
      });
    },
  );
});
