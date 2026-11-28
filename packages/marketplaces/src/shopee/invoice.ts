import type { AppError } from "@sellbridge/shared/errors";
import { parseAccessKey } from "@sellbridge/shared/nfe-access-key";
import { readAuthorizedNfeXml } from "@sellbridge/shared/nfe-xml";
import type { MarketplaceSaleInvoice } from "@sellbridge/shared/reseller-invoice";
import { z } from "zod";
import { hasMarketplaceCause, marketplaceError } from "../errors.ts";
import type { BuyerBilling } from "../mercado-livre/billing.ts";
import type {
  MercadoLivreApprovedPayment,
  MercadoLivreSalePayments,
} from "../mercado-livre/sale-payments.ts";
import type { StoreCredentials } from "../types.ts";
import { requestShop, type ShopeeContext } from "./client.ts";
import { parseSerial, readDetails } from "./orders.ts";
import type { ShopeeEnvelope } from "./schemas.ts";

/**
 * The reseller's sale NF-e on a Shopee order, as "Como subir a NF-e através da OpenAPI e
 * Mascaramento de Dados" (open.shopee.com/developer-guide/382, read on 2026-11-28) describes it:
 * a shop with a CNPJ cannot ship until the note's XML is attached with v2.order.upload_invoice_doc,
 * except with a carrier that takes no NF-e (Correios). get_order_detail's `invoice_data` tells
 * whether one is attached; its `payment_info` and `buyer_cpf_id` are what the note needs.
 */

/** CFOPs Shopee accepts on an attached note (error 15 of the guide above). */
const SHOPEE_ACCEPTED_CFOPS: ReadonlySet<string> = new Set(
  (
    "6108 6102 5102 6107 6101 5101 5405 6404 6403 6106 5403 5106 6104 6109 6115 6103 6105 6401 " +
    "5115 6120 5103 5105 5104 5109 6402 5120 6118 5401 5402 5112 5114 6112 5117 6117 5118 6113 " +
    "6114 6119 5111 6123 6116 5116 5119 5113 6111"
  ).split(" "),
);
const NFE_MODEL = "55";
/** Shopee asks to wait this long after a note is authorized: SERPRO must know it first. */
export const SHOPEE_INVOICE_DELAY_IN_MS = 5 * 60_000;
/** v2.order.upload_invoice_doc takes files up to 1 MB. */
const MAX_UPLOAD_BYTES = 1_000_000;
const XML_FILE_TYPE = "4";

const invoiceDataSchema = z
  .object({
    access_key: z.string().nullish(),
    issue_date: z.number().int().nonnegative().nullish(),
  })
  .nullish();

const invoiceOrderSchema = z.object({
  order_sn: z.string(),
  invoice_data: invoiceDataSchema,
});

const billingOrderSchema = z.object({
  order_sn: z.string(),
  buyer_cpf_id: z.string().nullish(),
  recipient_address: z.object({ name: z.string().nullish() }).nullish(),
});

const paymentOrderSchema = z.object({
  order_sn: z.string(),
  payment_info: z
    .array(
      z.object({
        payment_method: z.string().nullish(),
        card_brand: z.string().nullish(),
        transaction_id: z.string().nullish(),
        payment_amount: z.number().nonnegative().max(1_000_000_000).nullish(),
      }),
    )
    .nullish(),
});

async function orderRow<TSchema extends z.ZodType<{ order_sn: string }>>(
  context: ShopeeContext,
  store: StoreCredentials,
  input: { orderId: string; fields: string; schema: TSchema },
): Promise<z.output<TSchema> | null> {
  const serial = parseSerial(input.orderId);
  const detail = await readDetails(context, store, [serial], input.fields);
  for (const row of detail.order_list) {
    const parsed = input.schema.safeParse(row);
    if (parsed.success && parsed.data.order_sn === serial) {
      return parsed.data;
    }
  }
  return null;
}

function presentText(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text === "" ? null : text;
}

/** The note attached to the order, or null while there is none. The caller checks the key. */
export async function readShopeeSaleInvoice(
  context: ShopeeContext,
  store: StoreCredentials,
  orderId: string,
): Promise<MarketplaceSaleInvoice | null> {
  const order = await orderRow(context, store, {
    orderId,
    fields: "invoice_data",
    schema: invoiceOrderSchema,
  });
  const accessKey = presentText(order?.invoice_data?.access_key);
  if (accessKey === null) {
    return null;
  }
  const issueDate = order?.invoice_data?.issue_date;
  return {
    accessKey,
    issuedAt: issueDate === null || issueDate === undefined ? null : new Date(issueDate * 1_000),
  };
}

const DOCUMENT_TYPES: Readonly<Record<number, BuyerBilling["documentType"]>> = {
  11: "CPF",
  14: "CNPJ",
};

/**
 * The buyer's CPF (or CNPJ) and name for the note. Shopee sends them only to shops with a CNPJ,
 * from INVOICE_PENDING on; null when the order has no document.
 */
export async function readShopeeBuyerBilling(
  context: ShopeeContext,
  store: StoreCredentials,
  orderId: string,
): Promise<BuyerBilling | null> {
  const order = await orderRow(context, store, {
    orderId,
    fields: "buyer_cpf_id,recipient_address",
    schema: billingOrderSchema,
  });
  const document = (order?.buyer_cpf_id ?? "").replace(/\D/g, "");
  const documentType = DOCUMENT_TYPES[document.length];
  if (documentType === undefined) {
    return null;
  }
  const name = presentText(order?.recipient_address?.name);
  return {
    documentType,
    document,
    name: name === null || name.includes("*") ? null : name.slice(0, 120),
    stateRegistration: null,
  };
}

/** Shopee's card brands as Mercado Livre names them, so one slot table serves both. */
const CARD_BRANDS: Readonly<Record<string, string>> = {
  visa: "visa",
  master: "master",
  mastercard: "master",
  amex: "amex",
  americanexpress: "amex",
  elo: "elo",
  hipercard: "hipercard",
  diners: "diners",
  dinersclub: "diners",
};

function folded(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/**
 * A Shopee payment in Mercado Livre's terms (`payment_type`, `payment_method_id`), which the
 * reseller's payment slots read. A kind not listed keeps Shopee's words and maps to no slot.
 */
function paymentKind(method: string, brand: string): { type: string; methodId: string } {
  const name = folded(method);
  const card = CARD_BRANDS[folded(brand)] ?? folded(brand);
  if (name === "pix") {
    return { type: "bank_transfer", methodId: "pix" };
  }
  if (name.includes("boleto")) {
    return { type: "ticket", methodId: "boleto" };
  }
  if (name.includes("credit")) {
    return { type: "credit_card", methodId: card };
  }
  if (name.includes("debit")) {
    return { type: "debit_card", methodId: card };
  }
  if (name.includes("shopeepay") || name.includes("wallet") || name.includes("saldo")) {
    return { type: "account_money", methodId: "shopeepay" };
  }
  return { type: name, methodId: name };
}

/** The order's payments (NT 2025.001's card brand and authorization code included). */
export async function readShopeeSalePayments(
  context: ShopeeContext,
  store: StoreCredentials,
  orderId: string,
): Promise<MercadoLivreSalePayments> {
  const order = await orderRow(context, store, {
    orderId,
    fields: "payment_info",
    schema: paymentOrderSchema,
  });
  const payments: MercadoLivreApprovedPayment[] = [];
  for (const payment of order?.payment_info ?? []) {
    const method = presentText(payment.payment_method);
    const amount = payment.payment_amount;
    if (method === null || amount === null || amount === undefined) {
      continue;
    }
    payments.push({
      ...paymentKind(method, payment.card_brand ?? ""),
      authorizationCode: presentText(payment.transaction_id),
      amountCents: Math.round(amount * 100),
    });
  }
  return { payments };
}

/**
 * Why Shopee would refuse this note before it is sent, in the reseller's words, or null when it
 * may go: only an authorized model 55 note with CFOPs from Shopee's list.
 */
export function shopeeInvoiceProblem(input: { accessKey: string; xml: string }): string | null {
  if (new TextEncoder().encode(input.xml).byteLength > MAX_UPLOAD_BYTES) {
    return "O XML desta nota passa de 1 MB, o limite da Shopee. Anexe a nota na Central do Vendedor da Shopee.";
  }
  const reading = readAuthorizedNfeXml(input.xml);
  if (reading.problem !== null) {
    return reading.problem;
  }
  if (parseAccessKey(input.accessKey)?.model !== NFE_MODEL) {
    return "A Shopee só aceita NF-e modelo 55. Emita a nota de venda como NF-e (modelo 55).";
  }
  const refused = reading.cfops.find((cfop) => !SHOPEE_ACCEPTED_CFOPS.has(cfop));
  if (refused !== undefined || reading.cfops.length === 0) {
    const shown = refused ?? "vazio";
    return `A Shopee não aceita o CFOP ${shown} desta nota. Use um CFOP de venda aceito pela Shopee, como 5120 ou 6120, em Integrações › Bling.`;
  }
  return null;
}

/** Refusals of upload_invoice_doc (errors of the guide above), by a piece of Shopee's message. */
const UPLOAD_REFUSALS: readonly { readonly match: string; readonly problem: string }[] = [
  {
    match: "invalid cnpj",
    problem:
      "A Shopee recusou a nota: o CNPJ de quem emitiu não é o CNPJ da sua loja na Shopee. Emita a nota com o CNPJ cadastrado na Shopee.",
  },
  {
    match: "invalid uf",
    problem:
      "A Shopee recusou a nota: o estado de quem emitiu não é o da sua loja na Shopee. Confira o cadastro da loja na Shopee.",
  },
  {
    match: "state registration",
    problem:
      "A Shopee recusou a nota: a inscrição estadual da nota não é a da sua loja na Shopee. Confira o cadastro da loja na Shopee.",
  },
  {
    match: "invoice issuer",
    problem:
      "Na Shopee, a sua loja usa o emissor de notas da própria Shopee. Na Central do Vendedor, em Loja › Perfil da loja › Configuração de nota fiscal, escolha Outro e peça para tentar de novo.",
  },
  {
    match: "canceled nf-e",
    problem: "A nota foi cancelada. Emita outra nota para este pedido.",
  },
  {
    match: "access key duplicated",
    problem: "Esta nota já foi usada em outro pedido da Shopee. Emita a nota deste pedido.",
  },
  {
    match: "nf-e model",
    problem: "A Shopee só aceita NF-e modelo 55. Emita a nota de venda como NF-e (modelo 55).",
  },
  {
    match: "cfop",
    problem:
      "A Shopee não aceita o CFOP desta nota. Use um CFOP de venda aceito pela Shopee, como 5120 ou 6120, em Integrações › Bling.",
  },
  {
    match: "issue date",
    problem: "A Shopee recusou a nota: a data de emissão está no futuro. Confira a nota.",
  },
  {
    match: "invalid nf-e",
    problem:
      "A Shopee ainda não reconhece esta nota. Ela precisa de alguns minutos depois da autorização: tente de novo em 5 minutos.",
  },
];
/** The order takes no note (a carrier like Correios) or was cancelled: nothing to attach. */
const NOT_TAKEN = "invoice status is invalid";
const NOT_TAKEN_CAUSE = "invoice_not_taken";

function notTaken(): AppError {
  return marketplaceError("A Shopee não pede nota fiscal neste pedido.", {
    retryable: false,
    causes: [NOT_TAKEN_CAUSE],
  });
}

function uploadRefusal(envelope: ShopeeEnvelope): AppError | null {
  const message = (envelope.message ?? "").toLowerCase();
  const known = UPLOAD_REFUSALS.find((refusal) => message.includes(refusal.match));
  if (known === undefined) {
    return null;
  }
  return marketplaceError(known.problem, {
    retryable: known.match === "invalid nf-e",
    causes: [known.match],
  });
}

/** What came of the upload. */
export type ShopeeInvoiceUpload = "sent" | "already_attached" | "not_taken";

/**
 * Attaches the reseller's authorized note to the Shopee order. A note already there with the same
 * key is left as is; an order that takes no note (Correios) reads "not_taken".
 *
 * @throws {AppError} EXTERNAL_PROVIDER, not retryable, with the reason in the reseller's words when
 * the note does not fit Shopee's rules or Shopee refuses it; retryable when Shopee is busy or
 * does not know the note yet.
 */
export async function uploadShopeeSaleInvoice(
  context: ShopeeContext,
  store: StoreCredentials,
  input: { orderId: string; accessKey: string; xml: string },
): Promise<ShopeeInvoiceUpload> {
  const problem = shopeeInvoiceProblem(input);
  if (problem !== null) {
    throw marketplaceError(problem, { retryable: false });
  }
  const attached = await readShopeeSaleInvoice(context, store, input.orderId);
  if (attached?.accessKey === input.accessKey) {
    return "already_attached";
  }
  const form = new FormData();
  form.set("order_sn", parseSerial(input.orderId));
  form.set("file_type", XML_FILE_TYPE);
  form.set("file", new Blob([input.xml], { type: "application/xml" }), `${input.accessKey}.xml`);
  try {
    await requestShop(context, {
      accessToken: store.accessToken,
      shopId: store.externalShopId,
      method: "POST",
      path: "/api/v2/order/upload_invoice_doc",
      payload: "top",
      schema: z.unknown(),
      form,
      explainRefusal: (envelope) =>
        (envelope.message ?? "").toLowerCase().includes(NOT_TAKEN)
          ? notTaken()
          : uploadRefusal(envelope),
    });
  } catch (error) {
    if (hasMarketplaceCause(error, NOT_TAKEN_CAUSE)) {
      return "not_taken";
    }
    throw error;
  }
  return "sent";
}
