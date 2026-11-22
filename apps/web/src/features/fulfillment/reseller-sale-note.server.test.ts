import { beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "35261111222333000181550010000048211123456789";
const OTHER_KEY = "35261111222333000181550010000048221123456785";
const SHIPMENT_ID = "8f0c9a52-6f6e-4c9a-9a39-1d2b3c4d5e6f";

interface SavedNote {
  accessKey: string | null;
  source: string | null;
  issuedByErp: boolean;
  erpStopped: boolean;
}

const mocks = vi.hoisted(() => ({
  saved: null as SavedNote | null,
  replaceable: true,
  erpInvoiceId: null as number | null,
  send: vi.fn<(...input: unknown[]) => Promise<void>>(),
  saveUploaded: vi.fn<(...input: unknown[]) => Promise<void>>(),
  saveTyped: vi.fn<(...input: unknown[]) => Promise<void>>(),
  getInvoice: vi.fn<(id: number) => Promise<unknown>>(),
}));
vi.mock("@sellbridge/database/repositories", () => ({
  findBillingHolder: async () => ({ company: { cnpj: "11222333000181" } }),
  resellerSaleInvoicesOf: async () =>
    new Map(mocks.saved === null ? [] : [[SHIPMENT_ID, mocks.saved]]),
  canReplaceResellerSaleInvoice: async () => mocks.replaceable,
  resellerSaleErpInvoiceIdOf: async () => mocks.erpInvoiceId,
  saveUploadedResellerSaleInvoice: mocks.saveUploaded,
  saveTypedResellerSaleInvoice: mocks.saveTyped,
}));
vi.mock("@/features/supplier-panel/bling/bling-access.server", () => ({
  blingCredentials: () => ({ clientId: "test", clientSecret: "test" }),
  resellerBlingClient: () => ({ getInvoice: mocks.getInvoice }),
}));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("./marketplace.server", () => ({ sendResellerSaleNoteToMarketplace: mocks.send }));

import { saveResellerSaleNote, uploadResellerSaleNoteXml } from "./reseller-sale-note.server";

function authorizedXml(key: string): string {
  return [
    '<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">',
    `<NFe><infNFe versao="4.00" Id="NFe${key}"></infNFe></NFe>`,
    `<protNFe><infProt><chNFe>${key}</chNFe><cStat>100</cStat></infProt></protNFe>`,
    "</nfeProc>",
  ].join("");
}

/** The note as the reseller's Bling answers for it: Bling's `situacao` and its key, once it has one. */
function blingNote(situacao: number, accessKey: string | null = null) {
  return { situacao, number: "48", series: "1", accessKey, danfeUrl: null, lines: [] };
}

/** A parcel whose sale note the reseller's Bling took on, stopped or still going. */
function onBling(erpStopped: boolean, erpInvoiceId: number | null = 9001): void {
  mocks.saved = { accessKey: null, source: null, issuedByErp: true, erpStopped };
  mocks.erpInvoiceId = erpInvoiceId;
}

beforeEach(() => {
  mocks.saved = { accessKey: null, source: null, issuedByErp: false, erpStopped: false };
  mocks.replaceable = true;
  mocks.erpInvoiceId = null;
  mocks.send.mockReset();
  mocks.saveUploaded.mockReset();
  mocks.saveTyped.mockReset();
  mocks.getInvoice.mockReset();
});

describe("uploadResellerSaleNoteXml", () => {
  it("takes the same note already read on the marketplace as done, without sending it again", async () => {
    mocks.saved = { accessKey: KEY, source: "marketplace", issuedByErp: false, erpStopped: false };

    await uploadResellerSaleNoteXml("tenant", { shipmentId: SHIPMENT_ID, xml: authorizedXml(KEY) });

    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.saveUploaded).not.toHaveBeenCalled();
  });

  it("sends and saves another note over a wrong one while the remessa has not started", async () => {
    mocks.saved = { accessKey: OTHER_KEY, source: "typed", issuedByErp: false, erpStopped: false };

    await uploadResellerSaleNoteXml("tenant", { shipmentId: SHIPMENT_ID, xml: authorizedXml(KEY) });

    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.saveUploaded).toHaveBeenCalledTimes(1);
  });

  it("sends the XML of the same typed note even once the remessa cites it", async () => {
    mocks.saved = { accessKey: KEY, source: "typed", issuedByErp: false, erpStopped: false };
    mocks.replaceable = false;

    await uploadResellerSaleNoteXml("tenant", { shipmentId: SHIPMENT_ID, xml: authorizedXml(KEY) });

    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.saveUploaded).toHaveBeenCalledTimes(1);
  });

  it("sends nothing and points to support once the remessa cites the saved note", async () => {
    mocks.saved = { accessKey: OTHER_KEY, source: "typed", issuedByErp: false, erpStopped: false };
    mocks.replaceable = false;

    const upload = uploadResellerSaleNoteXml("tenant", {
      shipmentId: SHIPMENT_ID,
      xml: authorizedXml(KEY),
    });

    await expect(upload).rejects.toThrow(/fale com o suporte do SellBridge/);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("refuses a parcel that waits for no note of this reseller", async () => {
    mocks.saved = null;

    const upload = uploadResellerSaleNoteXml("tenant", {
      shipmentId: SHIPMENT_ID,
      xml: authorizedXml(KEY),
    });

    await expect(upload).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

async function uploadOf(key: string): Promise<void> {
  await uploadResellerSaleNoteXml("tenant", { shipmentId: SHIPMENT_ID, xml: authorizedXml(key) });
}

describe("one note per sale while the reseller's Bling holds it", () => {
  it("refuses another note while the reseller's Bling is issuing the sale's", async () => {
    onBling(false);

    await expect(uploadOf(KEY)).rejects.toThrow(/O seu Bling está emitindo/);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.getInvoice).not.toHaveBeenCalled();
  });

  it("refuses a typed key while the reseller's Bling is issuing the sale's", async () => {
    onBling(false);

    const typed = saveResellerSaleNote("tenant", { shipmentId: SHIPMENT_ID, accessKey: KEY });

    await expect(typed).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.saveTyped).not.toHaveBeenCalled();
  });

  it("refuses another note over the one the reseller's Bling issued", async () => {
    mocks.saved = { accessKey: OTHER_KEY, source: "bling", issuedByErp: true, erpStopped: false };

    await expect(uploadOf(KEY)).rejects.toThrow(/já tem a nota que saiu do seu Bling/);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("refuses another note while the stopped Bling note still waits for SEFAZ", async () => {
    onBling(true);
    mocks.getInvoice.mockResolvedValue(blingNote(3));

    await expect(uploadOf(KEY)).rejects.toThrow(/ainda não voltou/);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("refuses another note once the stopped Bling note was authorized", async () => {
    onBling(true);
    mocks.getInvoice.mockResolvedValue(blingNote(5, OTHER_KEY));

    await expect(uploadOf(KEY)).rejects.toThrow(/já tem a nota 48 autorizada/);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("takes the XML of the authorized Bling note itself after the Bling stopped", async () => {
    onBling(true);
    mocks.getInvoice.mockResolvedValue(blingNote(5, KEY));

    await uploadOf(KEY);

    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.saveUploaded).toHaveBeenCalledTimes(1);
  });

  it("takes another note once the Bling note was cancelled", async () => {
    onBling(true);
    mocks.getInvoice.mockResolvedValue(blingNote(2, OTHER_KEY));

    await uploadOf(KEY);

    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("takes another note once SEFAZ rejected the Bling note", async () => {
    onBling(true);
    mocks.getInvoice.mockResolvedValue(blingNote(4));

    await uploadOf(KEY);

    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("takes another note when the stopped Bling created none", async () => {
    onBling(true, null);

    await uploadOf(KEY);

    expect(mocks.getInvoice).not.toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("refuses another note when the reseller's Bling cannot be asked", async () => {
    onBling(true);
    mocks.getInvoice.mockRejectedValue(new Error("Bling offline"));

    await expect(uploadOf(KEY)).rejects.toThrow(/Não deu para conferir/);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
