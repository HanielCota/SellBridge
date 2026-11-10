import { describe, expect, it } from "vitest";
import {
  blingCallbackQuerySchema,
  blingCredentialsFrom,
  erpConnectRefusal,
} from "./bling-connection";

const SUPPLIER = "8b0f6f7e-1c1f-4d9a-9a39-5c1f6f0b2a11";

describe("erpConnectRefusal", () => {
  it("lets a member of the supplier's profile connect", () => {
    const refusal = erpConnectRefusal({ supplierIds: [SUPPLIER], impersonatedBy: null }, SUPPLIER);

    expect(refusal).toBeNull();
  });

  it("refuses someone outside the supplier's profile", () => {
    const refusal = erpConnectRefusal({ supplierIds: [], impersonatedBy: null }, SUPPLIER);

    expect(refusal).toBe("sem_permissao");
  });

  it("refuses during a team member's visit, even on the supplier's own profile", () => {
    const refusal = erpConnectRefusal(
      { supplierIds: [SUPPLIER], impersonatedBy: "admin-1" },
      SUPPLIER,
    );

    expect(refusal).toBe("visita");
  });
});

describe("blingCredentialsFrom", () => {
  it("keeps the feature off until both keys are set", () => {
    expect(blingCredentialsFrom({ BLING_CLIENT_ID: "id" })).toBeNull();
    expect(blingCredentialsFrom({ BLING_CLIENT_ID: "id", BLING_CLIENT_SECRET: "secret" })).toEqual({
      clientId: "id",
      clientSecret: "secret",
    });
  });
});

describe("blingCallbackQuerySchema", () => {
  it("accepts a code with its state or a refusal", () => {
    expect(blingCallbackQuerySchema.safeParse({ code: "abc", state: "s" }).success).toBe(true);
    expect(blingCallbackQuerySchema.safeParse({ error: "access_denied", state: "s" }).success).toBe(
      true,
    );
  });

  it("refuses a callback without code or error", () => {
    expect(blingCallbackQuerySchema.safeParse({ state: "s" }).success).toBe(false);
  });
});
