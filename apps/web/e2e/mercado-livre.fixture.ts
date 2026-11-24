import type { FetchLike } from "@sellbridge/marketplaces";
import { zipArchive } from "@sellbridge/marketplaces/testing";

/**
 * A stand-in for the Mercado Livre API the web server calls directly (the order's shipment and its
 * label), so the browser tests never reach the real service. It answers only for this seller and
 * for order numbers starting with `E2E_MERCADO_LIVRE_ORDER_PREFIX`; anything else is a 404, as
 * Mercado Livre answers an unknown order. Shapes follow the official "Mercado Envios 2" and
 * "Gerenciamento de envios" pages (read on 2026-11-12).
 */
export const E2E_MERCADO_LIVRE_SELLER_ID = "770001234";
export const E2E_MERCADO_LIVRE_ORDER_PREFIX = "7700";
/**
 * A second seller of the stand-in, for specs that connect a store of their own while others run
 * (a shop may be live only once): its orders start with this other prefix.
 */
export const E2E_MERCADO_LIVRE_NOTE_SELLER_ID = "770005678";
export const E2E_MERCADO_LIVRE_NOTE_ORDER_PREFIX = "7701";

/** What every ZPL label of the stand-in prints, so a test can find its download. */
export function standInZpl(shipmentId: string): string {
  return `^XA^FO40,40^A0N,40,40^FDEnvio ${shipmentId}^FS^XZ`;
}

const notFound = () => Response.json({ message: "not_found", status: 404 }, { status: 404 });

function knownOrder(id: string | undefined): id is string {
  return (
    id !== undefined &&
    (id.startsWith(E2E_MERCADO_LIVRE_ORDER_PREFIX) ||
      id.startsWith(E2E_MERCADO_LIVRE_NOTE_ORDER_PREFIX))
  );
}

/** The shipment ids of a `shipment_labels` call, all of them known to the stand-in. */
function labelShipmentIds(url: URL): string[] | null {
  const ids = (url.searchParams.get("shipment_ids") ?? "").split(",");
  return ids.every(knownOrder) ? ids : null;
}

function label(url: URL): Response {
  const ids = labelShipmentIds(url);
  if (ids === null) {
    return notFound();
  }
  if (url.searchParams.get("response_type") === "pdf") {
    return new Response(`%PDF-1.4\n% Etiquetas ${ids.join(",")}\n%%EOF`);
  }
  const files = ids.map((id) => ({ name: `${id}.txt`, content: standInZpl(id), deflate: true }));
  return new Response(zipArchive(files), { headers: { "content-type": "application/zip" } });
}

/** A sale shipment ready to print: Mercado Envios 2, dropped off at an agency. */
function shipment(id: string): Response {
  return Response.json({
    id: Number(id),
    status: "ready_to_ship",
    substatus: "ready_to_print",
    mode: "me2",
    logistic_type: "drop_off",
    tracking_number: null,
    tracking_method: null,
  });
}

/** The stand-in store's commission, in percent (`GET /sites/MLB/listing_prices`). */
export const STAND_IN_COMMISSION_PERCENT = 14;
/**
 * What the stand-in store pays to ship any package at any price, in reais
 * (`GET /users/{id}/shipping_options/free`): far above the published green table, so a price
 * read with the store's account visibly differs from the estimate.
 */
export const STAND_IN_SHIPPING_REAIS = 15;

function saleCost(url: URL): Response | null {
  if (url.pathname === "/sites/MLB/listing_prices") {
    return Response.json([
      {
        listing_type_id: "gold_special",
        sale_fee_details: { fixed_fee: 0, percentage_fee: STAND_IN_COMMISSION_PERCENT },
      },
    ]);
  }
  if (/^\/users\/\d+\/shipping_options\/free$/.test(url.pathname)) {
    return Response.json({ coverage: { all_country: { list_cost: STAND_IN_SHIPPING_REAIS } } });
  }
  return null;
}

/** Where the stand-in's supplier ships from; a test gives its supplier this NF-e address. */
export const STAND_IN_WAREHOUSE = {
  cep: "30130110",
  street: "Avenida Afonso Pena",
  number: "1500",
} as const;

/** Accounts whose id starts with this buy at the warehouse; any other number buys at home. */
export const STAND_IN_BUYS_AT_WAREHOUSE_PREFIX = "7790";

function standInAddress(
  id: number,
  fields: { cep: string; street: string; number: string },
  types: string[],
) {
  return {
    id,
    zip_code: fields.cep,
    street_name: fields.street,
    street_number: fields.number,
    types,
    status: "active",
  };
}

/** `GET /users/{id}/addresses`, in the shape of the "Endereços do usuário" page. */
function accountAddresses(url: URL): Response | null {
  const match = /^\/users\/(\d+)\/addresses$/.exec(url.pathname);
  const accountId = match?.[1];
  if (accountId === undefined) {
    return null;
  }
  const home = { cep: "01310100", street: "Rua Augusta", number: "200" };
  if (accountId.startsWith(STAND_IN_BUYS_AT_WAREHOUSE_PREFIX)) {
    return Response.json([
      standInAddress(1, STAND_IN_WAREHOUSE, [
        "default_buying_address",
        "default_selling_address",
        "shipping",
      ]),
    ]);
  }
  return Response.json([
    standInAddress(1, STAND_IN_WAREHOUSE, ["default_selling_address", "shipping"]),
    standInAddress(2, home, ["default_buying_address"]),
  ]);
}

/**
 * The NF-e keys sent to each shipment (`POST /shipments/{id}/invoice_data`), read back by its GET:
 * the stand-in keeps them while the test server runs, as Mercado Livre keeps an imported note.
 */
const importedInvoices = new Map<string, string>();

function invoiceData(id: string, init: RequestInit | undefined): Response {
  if (init?.method !== "POST") {
    const key = importedInvoices.get(id);
    return key === undefined ? notFound() : Response.json({ fiscal_key: key });
  }
  const xml = typeof init.body === "string" ? init.body : "";
  const key = /<chNFe>(\d{44})<\/chNFe>/.exec(xml)?.[1];
  if (key === undefined) {
    return Response.json({ error: "invalid_nfe_cstat", message: "Invalid NFe" }, { status: 400 });
  }
  importedInvoices.set(id, key);
  return Response.json({ id: Number(id), fiscal_key: key }, { status: 201 });
}

/**
 * Buyer questions the stand-in knows: "7702", the 9-digit seller asked, then a 3-digit number.
 * A number starting with 9 was answered on Mercado Livre itself before SellBridge tried.
 */
export const E2E_QUESTION_PREFIX = "7702";
/** What the stand-in shows as the answer given on Mercado Livre itself. */
export const STAND_IN_ELSEWHERE_ANSWER = "Respondido direto no Mercado Livre.";

/** A question id of the stand-in for this seller (9 digits) and number (3 digits). */
export function standInQuestionId(sellerId: string, number: string): string {
  return `${E2E_QUESTION_PREFIX}${sellerId}${number}`;
}

const QUESTION_ID = /^7702(\d{9})(\d{3})$/;

/** Answers the stand-in published (`POST /answers`), kept while the test server runs. */
const publishedAnswers = new Map<string, string>();

function standInQuestion(id: string, answer: string | undefined): Response {
  return Response.json({
    id: Number(id),
    seller_id: Number(QUESTION_ID.exec(id)?.[1] ?? "0"),
    item_id: "MLB7702",
    status: answer === undefined ? "UNANSWERED" : "ANSWERED",
    text: "Pergunta do comprador",
    date_created: "2026-11-21T10:00:00.000-03:00",
    answer:
      answer === undefined
        ? null
        : { text: answer, status: "ACTIVE", date_created: "2026-11-21T11:00:00.000-03:00" },
  });
}

function answerOf(id: string): string | undefined {
  if (QUESTION_ID.exec(id)?.[2]?.startsWith("9") === true) {
    return STAND_IN_ELSEWHERE_ANSWER;
  }
  return publishedAnswers.get(id);
}

/**
 * `GET /questions/{id}` and `POST /answers` ("Perguntas e respostas"): a question answered once
 * refuses a second answer, as Mercado Livre does.
 */
function questions(url: URL, init: RequestInit | undefined): Response | null {
  const questionId = /^\/questions\/(\d+)$/.exec(url.pathname)?.[1];
  if (questionId !== undefined) {
    return QUESTION_ID.test(questionId)
      ? standInQuestion(questionId, answerOf(questionId))
      : notFound();
  }
  if (url.pathname !== "/answers" || init?.method !== "POST") {
    return null;
  }
  const body: unknown = JSON.parse(typeof init.body === "string" ? init.body : "{}");
  const id = String(Reflect.get(Object(body), "question_id"));
  const text = String(Reflect.get(Object(body), "text"));
  if (!QUESTION_ID.test(id)) {
    return notFound();
  }
  if (answerOf(id) !== undefined) {
    return Response.json(
      { message: "Question already answered", error: "bad_request", status: 400, cause: [] },
      { status: 400 },
    );
  }
  publishedAnswers.set(id, text);
  return standInQuestion(id, text);
}

export const mercadoLivreStandIn: FetchLike = async (input, init) => {
  const url = new URL(input);
  if (url.host !== "api.mercadolibre.com") {
    return notFound();
  }
  const question = questions(url, init);
  if (question !== null) {
    return question;
  }
  if (url.pathname === "/shipment_labels") {
    return label(url);
  }
  const cost = saleCost(url);
  if (cost !== null) {
    return cost;
  }
  const addresses = accountAddresses(url);
  if (addresses !== null) {
    return addresses;
  }
  const [, resource, id, detail] = url.pathname.split("/");
  if (!knownOrder(id)) {
    return notFound();
  }
  if (resource === "orders" && detail === undefined) {
    const seller = id.startsWith(E2E_MERCADO_LIVRE_NOTE_ORDER_PREFIX)
      ? E2E_MERCADO_LIVRE_NOTE_SELLER_ID
      : E2E_MERCADO_LIVRE_SELLER_ID;
    return Response.json({ seller: { id: Number(seller) }, shipping: { id: Number(id) } });
  }
  if (resource === "shipments" && detail === "invoice_data") {
    return invoiceData(id, init);
  }
  if (resource === "orders" && detail === "shipments") {
    return Response.json([{ id: Number(id), type: "forward" }]);
  }
  if (resource === "shipments" && detail === undefined) {
    return shipment(id);
  }
  return notFound();
};
