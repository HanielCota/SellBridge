import { describe, expect, it } from "vitest";
import {
  blingCallbackQuerySchema,
  blingCredentialsFrom,
  blingOutcomeSearch,
  catalogExportRefusal,
  erpConnectRefusal,
  erpOwnerActionRefusal,
  invoicingRefusal,
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

describe("blingOutcomeSearch", () => {
  it("keeps a known outcome of the Bling consent page", () => {
    expect(blingOutcomeSearch({ bling: "conectado", perfil: "x" })).toEqual({ bling: "conectado" });
  });

  it("drops an outcome the page does not know, so a link cannot make it say anything", () => {
    expect(blingOutcomeSearch({ bling: "<b>oi</b>" })).toEqual({});
    expect(blingOutcomeSearch({})).toEqual({});
  });
});

describe("erpOwnerActionRefusal", () => {
  it("lets the supplier's own member act on its Bling", () => {
    const refusal = erpOwnerActionRefusal({ viewerKind: "supplier", impersonatedBy: null });

    expect(refusal).toBeNull();
  });

  it("refuses the team acting on a supplier's Bling outside a visit", () => {
    const refusal = erpOwnerActionRefusal({ viewerKind: "team", impersonatedBy: null });

    expect(refusal).toBe("Só quem faz parte deste fornecedor pode mexer no Bling dele.");
  });

  it("refuses during a team member's visit", () => {
    const refusal = erpOwnerActionRefusal({ viewerKind: "supplier", impersonatedBy: "admin-1" });

    expect(refusal).toBe("Durante a visita da equipe não dá para mexer no Bling do fornecedor.");
  });
});

describe("catalogExportRefusal", () => {
  it("sends the catalog for the supplier's connected account", () => {
    const refusal = catalogExportRefusal(
      { viewerKind: "supplier", impersonatedBy: null },
      "connected",
    );

    expect(refusal).toBeNull();
  });

  it("refuses sending the catalog while the account is not connected", () => {
    const actor = { viewerKind: "supplier", impersonatedBy: null } as const;

    expect(catalogExportRefusal(actor, null)).toBe("Conecte o Bling antes de enviar os produtos.");
    expect(catalogExportRefusal(actor, "expired")).toBe(
      "Conecte o Bling antes de enviar os produtos.",
    );
  });

  it("refuses the team sending products to a supplier's Bling", () => {
    const refusal = catalogExportRefusal({ viewerKind: "team", impersonatedBy: null }, "connected");

    expect(refusal).not.toBeNull();
  });
});

describe("invoicingRefusal", () => {
  const supplier = { viewerKind: "supplier", impersonatedBy: null } as const;

  it("lets the supplier turn the NF-e on with a connected account and fiscal data", () => {
    const refusal = invoicingRefusal({
      actor: supplier,
      enabling: true,
      connectionStatus: "connected",
      fiscalReady: true,
    });

    expect(refusal).toBeNull();
  });

  it("asks for the fiscal data on Marca before turning the NF-e on", () => {
    const refusal = invoicingRefusal({
      actor: supplier,
      enabling: true,
      connectionStatus: "connected",
      fiscalReady: false,
    });

    expect(refusal).toContain("Marca");
  });

  it("asks to connect Bling before turning the NF-e on", () => {
    const refusal = invoicingRefusal({
      actor: supplier,
      enabling: true,
      connectionStatus: "expired",
      fiscalReady: true,
    });

    expect(refusal).toContain("Conecte o Bling");
  });

  it("lets the supplier turn it off even without fiscal data", () => {
    const refusal = invoicingRefusal({
      actor: supplier,
      enabling: false,
      connectionStatus: "expired",
      fiscalReady: false,
    });

    expect(refusal).toBeNull();
  });

  it("refuses a team visit", () => {
    const refusal = invoicingRefusal({
      actor: { viewerKind: "supplier", impersonatedBy: "admin-1" },
      enabling: true,
      connectionStatus: "connected",
      fiscalReady: true,
    });

    expect(refusal).not.toBeNull();
  });
});
