import { describe, expect, it } from "vitest";
import {
  isOnNoticePage,
  nextResellerSetupNotice,
  nextSupplierSetupNotice,
  receivingAccountState,
  type ResellerSetupFacts,
  type SupplierSetupFacts,
} from "./account-setup-notice";

const SUPPLIER_READY: SupplierSetupFacts = {
  receivingAccount: "approved",
  blingToReconnect: null,
  products: 12,
  submittedProducts: 10,
  onBehalfInvoiceOff: false,
};

function supplierNotice(changes: Partial<SupplierSetupFacts>) {
  return nextSupplierSetupNotice({ ...SUPPLIER_READY, ...changes })?.key ?? null;
}

describe("receivingAccountState", () => {
  it("reads no account, or one not connected, as closed", () => {
    expect(receivingAccountState(null)).toBe("closed");
    expect(receivingAccountState({ status: "expired", reviewStatus: "approved" })).toBe("closed");
  });

  it("tells documents to send apart from Asaas's own review", () => {
    expect(receivingAccountState({ status: "connected", reviewStatus: "pending" })).toBe(
      "documents",
    );
    expect(receivingAccountState({ status: "connected", reviewStatus: null })).toBe("documents");
    expect(receivingAccountState({ status: "connected", reviewStatus: "awaiting_approval" })).toBe(
      "in_review",
    );
  });

  it("reads approved and rejected accounts", () => {
    expect(receivingAccountState({ status: "connected", reviewStatus: "approved" })).toBe(
      "approved",
    );
    expect(receivingAccountState({ status: "connected", reviewStatus: "rejected" })).toBe(
      "rejected",
    );
  });
});

describe("nextSupplierSetupNotice", () => {
  it("shows nothing once the supplier is set up", () => {
    expect(supplierNotice({})).toBeNull();
  });

  it("asks to open the receiving account before anything else", () => {
    const notice = nextSupplierSetupNotice({
      receivingAccount: "closed",
      blingToReconnect: "supplier-1",
      products: 0,
      submittedProducts: 0,
      onBehalfInvoiceOff: true,
    });

    expect(notice?.key).toBe("receiving-account-closed");
    expect(notice?.target).toEqual({ kind: "page", page: "receiving" });
  });

  it("asks to fix a refused account or send the documents Asaas waits for", () => {
    expect(supplierNotice({ receivingAccount: "rejected" })).toBe("receiving-account-rejected");
    expect(supplierNotice({ receivingAccount: "documents" })).toBe("receiving-account-documents");
  });

  it("leaves the account alone while Asaas reviews it, or while Asaas is off", () => {
    expect(supplierNotice({ receivingAccount: "in_review" })).toBeNull();
    expect(supplierNotice({ receivingAccount: null })).toBeNull();
  });

  it("asks to reconnect Bling once the account is fine, through its authorization", () => {
    const notice = nextSupplierSetupNotice({
      ...SUPPLIER_READY,
      blingToReconnect: "supplier-1",
      products: 0,
    });

    expect(notice?.key).toBe("bling-reconnect");
    expect(notice?.target).toEqual({
      kind: "authorization",
      href: "/api/integracoes/bling/conectar?fornecedor=supplier-1",
    });
  });

  it("asks for a first product, then to publish the drafts", () => {
    expect(supplierNotice({ products: 0, submittedProducts: 0 })).toBe("no-products");
    expect(supplierNotice({ products: 3, submittedProducts: 0 })).toBe("products-in-draft");
  });

  it("asks to turn the venda à ordem note on last", () => {
    expect(supplierNotice({ onBehalfInvoiceOff: true })).toBe("on-behalf-invoice-off");
    expect(supplierNotice({ onBehalfInvoiceOff: true, products: 0 })).toBe("no-products");
  });

  it("moves to the next item once one is fixed", () => {
    const missingBoth = { receivingAccount: "closed", products: 0 } as const;

    expect(supplierNotice(missingBoth)).toBe("receiving-account-closed");
    expect(supplierNotice({ ...missingBoth, receivingAccount: "approved" })).toBe("no-products");
  });
});

const ADDRESS = { cep: "01001000" };

function resellerNotice(holder: ResellerSetupFacts["holder"]) {
  return nextResellerSetupNotice({ holder })?.key ?? null;
}

describe("nextResellerSetupNotice", () => {
  it("leaves a reseller without data to the setup guide", () => {
    expect(resellerNotice(null)).toBeNull();
  });

  it("asks nothing of a reseller selling with a CPF", () => {
    expect(resellerNotice({ company: null, address: null })).toBeNull();
  });

  it("asks a company for its address first, on the data step", () => {
    const notice = nextResellerSetupNotice({
      holder: { company: { stateRegistration: null }, address: null },
    });

    expect(notice?.key).toBe("company-address");
    expect(notice?.target).toEqual({ kind: "page", page: "company-data" });
  });

  it("asks a company for its state registration once the address is there", () => {
    expect(resellerNotice({ company: { stateRegistration: null }, address: ADDRESS })).toBe(
      "company-state-registration",
    );
  });

  it("clears once the company data is complete, an exempt company included", () => {
    expect(
      resellerNotice({ company: { stateRegistration: "110042490114" }, address: ADDRESS }),
    ).toBeNull();
    expect(
      resellerNotice({ company: { stateRegistration: "ISENTO" }, address: ADDRESS }),
    ).toBeNull();
  });
});

describe("phoneAction", () => {
  const notices = [
    ...(["closed", "rejected", "documents"] as const).map((receivingAccount) =>
      nextSupplierSetupNotice({ ...SUPPLIER_READY, receivingAccount }),
    ),
    nextSupplierSetupNotice({ ...SUPPLIER_READY, blingToReconnect: "s-1" }),
    nextSupplierSetupNotice({ ...SUPPLIER_READY, products: 0, submittedProducts: 0 }),
    nextSupplierSetupNotice({ ...SUPPLIER_READY, submittedProducts: 0 }),
    nextSupplierSetupNotice({ ...SUPPLIER_READY, onBehalfInvoiceOff: true }),
    nextResellerSetupNotice({ holder: { company: { stateRegistration: null }, address: null } }),
    nextResellerSetupNotice({ holder: { company: { stateRegistration: null }, address: ADDRESS } }),
  ];

  it("is part of what the link reads aloud, so voice control finds it", () => {
    for (const notice of notices) {
      const spoken = `${notice?.message ?? ""} · ${notice?.action ?? ""}`.toLowerCase();

      expect(spoken).toContain(notice?.phoneAction.toLowerCase());
    }
  });

  it("stays short enough for the phone header", () => {
    for (const notice of notices) {
      expect(notice?.phoneAction.length).toBeLessThanOrEqual(20);
    }
  });
});

describe("isOnNoticePage", () => {
  const notice = nextSupplierSetupNotice({ ...SUPPLIER_READY, receivingAccount: "closed" });

  it("hides the notice on the page that fixes it", () => {
    expect(notice === null ? null : isOnNoticePage(notice, "/fornecedor/painel/recebimentos")).toBe(
      true,
    );
  });

  it("shows it everywhere else, a page with a similar name included", () => {
    expect(notice === null ? null : isOnNoticePage(notice, "/fornecedor/painel")).toBe(false);
    expect(
      notice === null ? null : isOnNoticePage(notice, "/fornecedor/painel/recebimentos-antigos"),
    ).toBe(false);
  });

  it("never hides an authorization link", () => {
    const reconnect = nextSupplierSetupNotice({ ...SUPPLIER_READY, blingToReconnect: "s-1" });

    expect(reconnect === null ? null : isOnNoticePage(reconnect, "/fornecedor/painel")).toBe(false);
  });
});
