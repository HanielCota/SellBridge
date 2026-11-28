import { describe, expect, it } from "vitest";
import { hasMarketplaceCause } from "../errors.ts";
import { shopeeInvoiceProblem } from "./invoice.ts";
import {
  readShopeeBuyerBilling,
  readShopeeSaleInvoice,
  readShopeeSalePayments,
  uploadShopeeSaleInvoice,
} from "./shopee-connector.ts";
import {
  fakeShopee,
  jsonResponse,
  PARTNER_ID,
  PARTNER_KEY,
  refusal,
  type Responder,
} from "./testing/fake-shopee.ts";

const STORE = { accessToken: "test-token", externalShopId: "727720655" };
const SERIAL = "261126E81SYYKE";
const KEY = "35261111222333000181550010000048211123456789";
const KEY_MODEL_65 = "35261111222333000181650010000048211123456781";

function success(response: unknown) {
  return jsonResponse({ request_id: "req-1", error: "", response });
}

function nfeProc(input: { key?: string; cfops?: readonly string[] } = {}): string {
  const key = input.key ?? KEY;
  const items = (input.cfops ?? ["5120"])
    .map((cfop, index) => `<det nItem="${index + 1}"><prod><CFOP>${cfop}</CFOP></prod></det>`)
    .join("");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">',
    `<NFe><infNFe versao="4.00" Id="NFe${key}"><ide><mod>55</mod></ide>${items}</infNFe></NFe>`,
    `<protNFe versao="4.00"><infProt><chNFe>${key}</chNFe><dhRecbto>2026-11-28T10:00:00-03:00</dhRecbto>`,
    "<cStat>100</cStat></infProt></protNFe></nfeProc>",
  ].join("");
}

function detail(order: Record<string, unknown>): Responder {
  return () => success({ order_list: [{ order_sn: SERIAL, ...order }] });
}

function setup(routes: Record<string, Responder>) {
  const api = fakeShopee(routes);
  const config = {
    partnerId: PARTNER_ID,
    partnerKey: PARTNER_KEY,
    fetchImplementation: api.fetchImplementation,
    now: () => new Date("2026-11-28T13:30:00Z"),
    retry: { retries: 0 },
  };
  return { ...api, config };
}

describe("readShopeeSaleInvoice", () => {
  it("reads the key and issue date of the attached note", async () => {
    const { config, calls } = setup({
      "GET /api/v2/order/get_order_detail": detail({
        invoice_data: { access_key: KEY, issue_date: 1_795_000_000 },
      }),
    });

    const invoice = await readShopeeSaleInvoice(config, STORE, SERIAL);

    expect(invoice).toEqual({ accessKey: KEY, issuedAt: new Date(1_795_000_000_000) });
    expect(calls[0]?.query.get("response_optional_fields")).toBe("invoice_data");
  });

  it("reads none while Shopee sends an empty invoice", async () => {
    const { config } = setup({
      "GET /api/v2/order/get_order_detail": detail({ invoice_data: {} }),
    });

    expect(await readShopeeSaleInvoice(config, STORE, SERIAL)).toBeNull();
  });
});

describe("readShopeeBuyerBilling", () => {
  it("reads the buyer's CPF and name", async () => {
    const { config } = setup({
      "GET /api/v2/order/get_order_detail": detail({
        buyer_cpf_id: "123.456.789-09",
        recipient_address: { name: "Maria Silva" },
      }),
    });

    expect(await readShopeeBuyerBilling(config, STORE, SERIAL)).toEqual({
      documentType: "CPF",
      document: "12345678909",
      name: "Maria Silva",
      stateRegistration: null,
    });
  });

  it("reads none when Shopee hides the document", async () => {
    const { config } = setup({
      "GET /api/v2/order/get_order_detail": detail({ buyer_cpf_id: "***.***.***-**" }),
    });

    expect(await readShopeeBuyerBilling(config, STORE, SERIAL)).toBeNull();
  });
});

describe("readShopeeSalePayments", () => {
  it("reads a card payment with its brand and authorization code, and a Pix", async () => {
    const { config } = setup({
      "GET /api/v2/order/get_order_detail": detail({
        payment_info: [
          {
            payment_method: "Credit Card",
            card_brand: "MASTER",
            transaction_id: "AUTH77",
            payment_amount: 80.5,
          },
          { payment_method: "Pix", card_brand: "", transaction_id: "", payment_amount: 19.5 },
        ],
      }),
    });

    const sale = await readShopeeSalePayments(config, STORE, SERIAL);

    expect(sale.payments).toEqual([
      { type: "credit_card", methodId: "master", authorizationCode: "AUTH77", amountCents: 8_050 },
      { type: "bank_transfer", methodId: "pix", authorizationCode: null, amountCents: 1_950 },
    ]);
  });
});

describe("shopeeInvoiceProblem", () => {
  it("lets an authorized model 55 note with a sale CFOP go", () => {
    expect(shopeeInvoiceProblem({ accessKey: KEY, xml: nfeProc() })).toBeNull();
  });

  it("refuses a CFOP Shopee does not accept", () => {
    const problem = shopeeInvoiceProblem({
      accessKey: KEY,
      xml: nfeProc({ cfops: ["5120", "5949"] }),
    });

    expect(problem).toContain("CFOP 5949");
  });

  it("refuses a note that is not model 55", () => {
    const problem = shopeeInvoiceProblem({
      accessKey: KEY_MODEL_65,
      xml: nfeProc({ key: KEY_MODEL_65 }),
    });

    expect(problem).toContain("modelo 55");
  });
});

describe("uploadShopeeSaleInvoice", () => {
  it("sends the XML as a file for the order", async () => {
    const { config, calls } = setup({
      "GET /api/v2/order/get_order_detail": detail({ invoice_data: {} }),
      "POST /api/v2/order/upload_invoice_doc": () =>
        jsonResponse({ request_id: "req-2", error: "", message: "" }),
    });

    const outcome = await uploadShopeeSaleInvoice(config, STORE, {
      orderId: SERIAL,
      accessKey: KEY,
      xml: nfeProc(),
    });

    const upload = calls.find((call) => call.path.endsWith("/upload_invoice_doc"));
    const file = upload?.form?.get("file");
    expect(outcome).toBe("sent");
    expect(upload?.form?.get("order_sn")).toBe(SERIAL);
    expect(upload?.form?.get("file_type")).toBe("4");
    expect(file instanceof Blob ? await file.text() : null).toBe(nfeProc());
  });

  it("leaves a note already attached with the same key", async () => {
    const { config, calls } = setup({
      "GET /api/v2/order/get_order_detail": detail({ invoice_data: { access_key: KEY } }),
    });

    const outcome = await uploadShopeeSaleInvoice(config, STORE, {
      orderId: SERIAL,
      accessKey: KEY,
      xml: nfeProc(),
    });

    expect(outcome).toBe("already_attached");
    expect(calls.some((call) => call.path.endsWith("/upload_invoice_doc"))).toBe(false);
  });

  it("reads an order that takes no note as not taken", async () => {
    const { config } = setup({
      "GET /api/v2/order/get_order_detail": detail({ invoice_data: {} }),
      "POST /api/v2/order/upload_invoice_doc": () =>
        refusal(
          "error_param",
          "Wrong parameters, detail: The invoice status is invalid to upload invoice data.",
        ),
    });

    const outcome = await uploadShopeeSaleInvoice(config, STORE, {
      orderId: SERIAL,
      accessKey: KEY,
      xml: nfeProc(),
    });

    expect(outcome).toBe("not_taken");
  });

  it("explains a note from another CNPJ in the reseller's words", async () => {
    const { config } = setup({
      "GET /api/v2/order/get_order_detail": detail({ invoice_data: {} }),
      "POST /api/v2/order/upload_invoice_doc": () =>
        refusal(
          "error_param",
          "Wrong parameters, detail: Invalid CNPJ. The access key CNPJ must be the same as the registration..",
        ),
    });

    const upload = uploadShopeeSaleInvoice(config, STORE, {
      orderId: SERIAL,
      accessKey: KEY,
      xml: nfeProc(),
    });

    await expect(upload).rejects.toThrow(/CNPJ da sua loja na Shopee/);
  });

  it("tries again later when Shopee does not know the new note yet", async () => {
    const { config } = setup({
      "GET /api/v2/order/get_order_detail": detail({ invoice_data: {} }),
      "POST /api/v2/order/upload_invoice_doc": () =>
        refusal("error_param", "Wrong parameters, detail: Invalid NF-e."),
    });

    const error = await uploadShopeeSaleInvoice(config, STORE, {
      orderId: SERIAL,
      accessKey: KEY,
      xml: nfeProc(),
    }).catch((caught: unknown) => caught);

    expect(hasMarketplaceCause(error, "invalid nf-e")).toBe(true);
    expect(error).toMatchObject({ details: { retryable: true } });
  });
});
