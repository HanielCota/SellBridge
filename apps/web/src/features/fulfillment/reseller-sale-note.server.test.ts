import { beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "35261111222333000181550010000048211123456789";
const OTHER_KEY = "35261111222333000181550010000048221123456785";
const SHIPMENT_ID = "8f0c9a52-6f6e-4c9a-9a39-1d2b3c4d5e6f";

const mocks = vi.hoisted(() => ({
  saved: null as { accessKey: string | null; source: string | null } | null,
  replaceable: true,
  send: vi.fn<(...input: unknown[]) => Promise<void>>(),
  saveUploaded: vi.fn<(...input: unknown[]) => Promise<void>>(),
}));
vi.mock("@sellbridge/database/repositories", () => ({
  findBillingHolder: async () => ({ company: { cnpj: "11222333000181" } }),
  resellerSaleInvoicesOf: async () =>
    new Map(mocks.saved === null ? [] : [[SHIPMENT_ID, mocks.saved]]),
  canReplaceResellerSaleInvoice: async () => mocks.replaceable,
  saveUploadedResellerSaleInvoice: mocks.saveUploaded,
  saveTypedResellerSaleInvoice: vi.fn<(...input: unknown[]) => Promise<void>>(),
}));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("./marketplace.server", () => ({ sendResellerSaleNoteToMarketplace: mocks.send }));

import { uploadResellerSaleNoteXml } from "./reseller-sale-note.server";

function authorizedXml(key: string): string {
  return [
    '<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">',
    `<NFe><infNFe versao="4.00" Id="NFe${key}"></infNFe></NFe>`,
    `<protNFe><infProt><chNFe>${key}</chNFe><cStat>100</cStat></infProt></protNFe>`,
    "</nfeProc>",
  ].join("");
}

beforeEach(() => {
  mocks.saved = { accessKey: null, source: null };
  mocks.replaceable = true;
  mocks.send.mockReset();
  mocks.saveUploaded.mockReset();
});

describe("uploadResellerSaleNoteXml", () => {
  it("takes the same note already read on the marketplace as done, without sending it again", async () => {
    mocks.saved = { accessKey: KEY, source: "marketplace" };

    await uploadResellerSaleNoteXml("tenant", { shipmentId: SHIPMENT_ID, xml: authorizedXml(KEY) });

    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.saveUploaded).not.toHaveBeenCalled();
  });

  it("sends and saves another note over a wrong one while the remessa has not started", async () => {
    mocks.saved = { accessKey: OTHER_KEY, source: "typed" };

    await uploadResellerSaleNoteXml("tenant", { shipmentId: SHIPMENT_ID, xml: authorizedXml(KEY) });

    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.saveUploaded).toHaveBeenCalledTimes(1);
  });

  it("sends nothing and points to support once the remessa cites the saved note", async () => {
    mocks.saved = { accessKey: OTHER_KEY, source: "typed" };
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
