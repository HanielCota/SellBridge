import { z } from "zod";
import { LABEL_NOT_READY_CAUSE, hasMarketplaceCause, marketplaceError } from "../errors.ts";
import type { StoreCredentials } from "../types.ts";
import { requestShop, requestShopPdf, type ShopeeContext, type ShopRequest } from "./client.ts";
import type { ShopeeEnvelope } from "./schemas.ts";
import { readOrderPackages } from "./orders.ts";

const PDF_DOCUMENT_TYPE = "NORMAL_AIR_WAYBILL";
const NOT_CREATED = "logistics.shipping_document_should_print_first";
const ALREADY_SHIPPED = "logistics.package_already_shipped";
const INVOICE_ERRORS = ["logistics.lack_of_invoice_data", "lack_of_invoice_data"];
const ARRANGED = new Set([
  "LOGISTICS_REQUEST_CREATED",
  "LOGISTICS_PICKUP_DONE",
  "LOGISTICS_DELIVERY_DONE",
]);
const labelWaitingCodes = [
  "logistics.download_later",
  "logistics.package_can_not_print",
  "logistics.logistic_order_is_locked_on_creating",
];

const shippingParametersSchema = z.object({
  info_needed: z.object({
    dropoff: z.array(z.string()).nullish(),
    pickup: z.array(z.string()).nullish(),
  }),
  dropoff: z.object({}).nullish(),
  pickup: z
    .object({
      address_list: z.array(
        z.object({
          address_id: z.number().int().positive(),
          address_flag: z.array(z.string()).nullish(),
          address: z.string().max(500).nullish(),
          district: z.string().max(200).nullish(),
          town: z.string().max(200).nullish(),
          city: z.string().max(200).nullish(),
          state: z.string().max(200).nullish(),
          zipcode: z.string().max(20).nullish(),
          time_slot_list: z
            .array(
              z.object({
                pickup_time_id: z.string().min(1),
                date: z.number().int().nonnegative().max(253_402_300_799).nullish(),
                time_text: z.string().max(200).nullish(),
                flags: z.array(z.string()).nullish(),
              }),
            )
            .nullish(),
        }),
      ),
    })
    .nullish(),
});

const trackingSchema = z.object({ tracking_number: z.string().nullish() });
const documentResultSchema = z.object({
  result_list: z.array(
    z.object({
      order_sn: z.string(),
      package_number: z.string().nullish(),
      status: z.string().nullish(),
      fail_error: z.string().nullish(),
      selectable_shipping_document_type: z.array(z.string()).nullish(),
      suggest_shipping_document_type: z.string().nullish(),
    }),
  ),
});

/** A pickup address of the reseller's Shopee shop, with the time slot Shopee would take. */
export interface ShopeePickupChoice {
  readonly addressId: number;
  readonly flags: readonly string[];
  readonly address: string;
  readonly district: string;
  readonly city: string;
  readonly state: string;
  readonly zipcode: string;
  readonly pickupTimeId: string | undefined;
  readonly pickupDate: Date | undefined;
  readonly timeText: string | undefined;
}

/** Whether a label needs the carrier's pickup scheduled first, and where it can be. */
export type ShopeePickupOptions =
  { kind: "not_needed" } | { kind: "pickup"; addresses: readonly ShopeePickupChoice[] };

/** The pickup the person asking for the label confirmed. */
export interface ConfirmedPickup {
  readonly addressId: number;
  readonly pickupTimeId: string | undefined;
}

/** Why a Shopee label waits: the pickup address must be confirmed before it is scheduled. */
export const PICKUP_CONFIRMATION_CAUSE = "pickup_confirmation_needed";

interface LabelRequest {
  context: ShopeeContext;
  store: StoreCredentials;
  parcel: { order_sn: string; package_number?: string };
}

function waitForLabel() {
  return marketplaceError(
    "A Shopee ainda está preparando a etiqueta. Tente de novo em instantes.",
    {
      retryable: true,
      causes: [LABEL_NOT_READY_CAUSE],
    },
  );
}

function invoiceRequired() {
  return marketplaceError(
    "A Shopee só libera a etiqueta depois que a nota fiscal da venda é anexada ao pedido. A revenda envia a nota pelo SellBridge ou pela Central do Vendedor da Shopee: tente de novo em alguns minutos.",
    {
      retryable: false,
    },
  );
}

function arrangeInSellerCenter() {
  return marketplaceError(
    "Organize o envio deste pedido na Central do Vendedor da Shopee e volte para emitir a etiqueta.",
    {
      retryable: false,
    },
  );
}

function allocationPending(envelope: ShopeeEnvelope) {
  return envelope.error === "logistics.error_param" &&
    envelope.message?.toLowerCase().includes("being allocated") === true
    ? waitForLabel()
    : null;
}

function callLogistics<Result>(
  request: LabelRequest,
  call: Omit<ShopRequest<Result>, "accessToken" | "shopId">,
) {
  return requestShop(request.context, {
    explainRefusal: allocationPending,
    ...call,
    accessToken: request.store.accessToken,
    shopId: request.store.externalShopId,
  });
}

function pickupConfirmationNeeded() {
  return marketplaceError("Confirme o endereço de coleta antes de gerar a etiqueta da Shopee.", {
    retryable: false,
    causes: [PICKUP_CONFIRMATION_CAUSE],
  });
}

function chooseUnambiguous<Choice>(
  choices: readonly Choice[],
  preferred: (choice: Choice) => boolean,
) {
  if (choices.length === 1) {
    return choices[0];
  }

  const recommended = choices.filter(preferred);
  return recommended.length === 1 ? recommended[0] : undefined;
}

type ShopeeAddress = NonNullable<
  z.output<typeof shippingParametersSchema>["pickup"]
>["address_list"][number];

function pickupDate(seconds: number | null | undefined): Date | undefined {
  return seconds === undefined || seconds === null || seconds === 0
    ? undefined
    : new Date(seconds * 1_000);
}

function pickupChoice(entry: ShopeeAddress, needsTime: boolean): ShopeePickupChoice | null {
  const slot = chooseUnambiguous(
    entry.time_slot_list ?? [],
    (candidate) => candidate.flags?.includes("recommended") === true,
  );
  if (slot === undefined && needsTime) {
    return null;
  }
  const timeText = slot?.time_text?.trim() ?? "";
  return {
    addressId: entry.address_id,
    flags: entry.address_flag ?? [],
    address: entry.address?.trim() ?? "",
    district: (entry.district ?? entry.town ?? "").trim(),
    city: entry.city?.trim() ?? "",
    state: entry.state?.trim() ?? "",
    zipcode: entry.zipcode?.trim() ?? "",
    pickupTimeId: slot?.pickup_time_id,
    pickupDate: pickupDate(slot?.date),
    timeText: timeText === "" ? undefined : timeText,
  };
}

type Arrangement =
  | { kind: "dropoff" }
  | { kind: "already_arranged" }
  | { kind: "pickup"; addresses: ShopeePickupChoice[] };

/**
 * What the shipment takes: a drop-off, or a pickup at one of the shop's addresses. The pickup is
 * never scheduled on the shop's default address on its own: the address is confirmed first.
 */
function arrangement(parameters: z.output<typeof shippingParametersSchema>): Arrangement {
  const { dropoff, pickup } = parameters.info_needed;
  const addresses = parameters.pickup?.address_list ?? [];
  if (dropoff?.length === 0 && pickup == null && addresses.length === 0) {
    return { kind: "dropoff" };
  }

  if (
    parameters.dropoff != null ||
    pickup == null ||
    pickup.some((field) => field !== "address_id" && field !== "pickup_time_id")
  ) {
    throw arrangeInSellerCenter();
  }

  const needsTime = pickup.includes("pickup_time_id");
  const choices = addresses.flatMap((entry) => pickupChoice(entry, needsTime) ?? []);
  if (choices.length === 0) {
    throw arrangeInSellerCenter();
  }
  return { kind: "pickup", addresses: choices };
}

/** The confirmed pickup, as Shopee still offers it: an address or a slot it changed is refused. */
function confirmedPickupBody(addresses: readonly ShopeePickupChoice[], confirmed: ConfirmedPickup) {
  const choice = addresses.find((entry) => entry.addressId === confirmed.addressId);
  if (choice === undefined || choice.pickupTimeId !== confirmed.pickupTimeId) {
    throw marketplaceError(
      "A Shopee mudou o endereço ou o horário da coleta. Peça a etiqueta de novo para confirmar.",
      { retryable: false },
    );
  }
  return { address_id: choice.addressId, pickup_time_id: choice.pickupTimeId };
}

function shipmentBody(choice: Arrangement, confirmed: ConfirmedPickup | undefined) {
  if (choice.kind === "already_arranged") {
    return null;
  }
  if (choice.kind === "dropoff") {
    return { dropoff: {} };
  }
  if (confirmed === undefined) {
    throw pickupConfirmationNeeded();
  }
  return { pickup: confirmedPickupBody(choice.addresses, confirmed) };
}

function explainArrangeError(error: unknown) {
  if (INVOICE_ERRORS.some((code) => hasMarketplaceCause(error, code))) {
    return invoiceRequired();
  }

  if (labelWaitingCodes.some((code) => hasMarketplaceCause(error, code))) {
    return waitForLabel();
  }

  return error;
}

async function readArrangement(request: LabelRequest) {
  try {
    const parameters = await callLogistics(request, {
      method: "GET",
      path: "/api/v2/logistics/get_shipping_parameter",
      payload: "response",
      schema: shippingParametersSchema,
      query: { order_sn: request.parcel.order_sn },
    });
    return arrangement(parameters);
  } catch (error) {
    if (hasMarketplaceCause(error, ALREADY_SHIPPED)) {
      return { kind: "already_arranged" } as const;
    }
    throw explainArrangeError(error);
  }
}

async function arrangeShipping(request: LabelRequest, confirmed: ConfirmedPickup | undefined) {
  const body = shipmentBody(await readArrangement(request), confirmed);
  if (body === null) {
    return;
  }
  try {
    await callLogistics(request, {
      method: "POST",
      path: "/api/v2/logistics/ship_order",
      payload: "top",
      schema: z.object({ request_id: z.string() }),
      json: { order_sn: request.parcel.order_sn, ...body },
    });
  } catch (error) {
    if (hasMarketplaceCause(error, ALREADY_SHIPPED)) {
      return;
    }
    throw explainArrangeError(error);
  }
}

function documentError(error: string) {
  if (labelWaitingCodes.includes(error)) {
    return waitForLabel();
  }

  return marketplaceError("A Shopee recusou a etiqueta. Confira o envio na Central do Vendedor.", {
    retryable: false,
    causes: [error],
  });
}

function resultForParcel(response: z.output<typeof documentResultSchema>, request: LabelRequest) {
  const result = response.result_list.find(
    (row) =>
      row.order_sn === request.parcel.order_sn &&
      (request.parcel.package_number === undefined ||
        !row.package_number ||
        row.package_number === request.parcel.package_number),
  );
  if (result === undefined) {
    throw marketplaceError("A Shopee não retornou a etiqueta do pedido solicitado.", {
      retryable: false,
    });
  }

  return result;
}

function documentParcel(request: LabelRequest) {
  return { ...request.parcel, shipping_document_type: PDF_DOCUMENT_TYPE };
}

async function documentStatus(request: LabelRequest) {
  const response = await callLogistics(request, {
    method: "POST",
    path: "/api/v2/logistics/get_shipping_document_result",
    payload: "response",
    schema: documentResultSchema,
    json: { order_list: [documentParcel(request)] },
    explainRefusal: (envelope, body) => {
      if (
        envelope.error !== "common.batch_api_all_failed" ||
        typeof body !== "object" ||
        body === null
      ) {
        return null;
      }

      const parsed = documentResultSchema.safeParse(Reflect.get(body, "response"));
      const row = parsed.success
        ? parsed.data.result_list.find((result) => result.order_sn === request.parcel.order_sn)
        : undefined;
      return row?.fail_error ? documentError(row.fail_error) : null;
    },
  });
  const result = resultForParcel(response, request);
  if (result.fail_error) {
    throw documentError(result.fail_error);
  }

  return result.status;
}

async function documentExists(request: LabelRequest) {
  try {
    const status = await documentStatus(request);
    if (status === "READY") {
      return true;
    }

    if (status === "FAILED") {
      return false;
    }

    throw waitForLabel();
  } catch (error) {
    if (hasMarketplaceCause(error, NOT_CREATED)) {
      return false;
    }

    throw error;
  }
}

async function requestDocument(request: LabelRequest) {
  const tracking = await callLogistics(request, {
    method: "GET",
    path: "/api/v2/logistics/get_tracking_number",
    payload: "response",
    schema: trackingSchema,
    query: request.parcel,
  });
  if (!tracking.tracking_number) {
    throw waitForLabel();
  }

  const parameters = await callLogistics(request, {
    method: "POST",
    path: "/api/v2/logistics/get_shipping_document_parameter",
    payload: "response",
    schema: documentResultSchema,
    json: { order_list: [request.parcel] },
  });
  const options = resultForParcel(parameters, request);
  if (options.fail_error) {
    throw documentError(options.fail_error);
  }

  if (
    !options.selectable_shipping_document_type?.includes(PDF_DOCUMENT_TYPE) &&
    options.suggest_shipping_document_type !== PDF_DOCUMENT_TYPE
  ) {
    throw marketplaceError(
      "A Shopee não oferece etiqueta em PDF para este envio. Emita pelo formato disponível na Central do Vendedor.",
      {
        retryable: false,
      },
    );
  }

  const created = await callLogistics(request, {
    method: "POST",
    path: "/api/v2/logistics/create_shipping_document",
    payload: "response",
    schema: documentResultSchema,
    json: {
      order_list: [{ ...documentParcel(request), tracking_number: tracking.tracking_number }],
    },
  });
  const result = resultForParcel(created, request);
  if (result.fail_error) {
    throw documentError(result.fail_error);
  }

  if (!(await documentExists(request))) {
    throw waitForLabel();
  }
}

async function labelOrder(context: ShopeeContext, store: StoreCredentials, orderId: string) {
  const order = await readOrderPackages(context, store, orderId);
  if (order.split_up || (order.package_list?.length ?? 0) > 1) {
    throw marketplaceError(
      "A Shopee dividiu este pedido em vários volumes. Imprima as etiquetas de cada volume na Central do Vendedor.",
      {
        retryable: false,
      },
    );
  }

  if (["INVOICE_PENDING", "PENDING_INVOICE"].includes(order.order_status)) {
    throw invoiceRequired();
  }

  if (
    !["READY_TO_SHIP", "PROCESSED", "SHIPPED", "TO_CONFIRM_RECEIVE", "COMPLETED"].includes(
      order.order_status,
    )
  ) {
    throw marketplaceError("A Shopee ainda não liberou este pedido para envio.", {
      retryable: false,
    });
  }

  const item = order.package_list?.[0];
  const parcel = {
    order_sn: order.order_sn,
    ...(item ? { package_number: item.package_number } : {}),
  };
  return {
    order,
    item,
    request: { context, store, parcel },
    needsArrangement:
      order.order_status === "READY_TO_SHIP" && !ARRANGED.has(item?.logistics_status ?? ""),
  };
}

/**
 * Where the carrier can pick up the order, read before the label is asked for: the shop's pickup
 * addresses, or "not needed" when the shipment is a drop-off or is already arranged.
 */
export async function readShopeePickupOptions(
  context: ShopeeContext,
  store: StoreCredentials,
  orderId: string,
): Promise<ShopeePickupOptions> {
  const label = await labelOrder(context, store, orderId);
  if (!label.needsArrangement) {
    return { kind: "not_needed" };
  }
  const choice = await readArrangement(label.request);
  return choice.kind === "pickup" ? choice : { kind: "not_needed" };
}

export async function getShopeeShippingLabel(
  context: ShopeeContext,
  store: StoreCredentials,
  orderId: string,
  pickup?: ConfirmedPickup,
) {
  const { order, item, request, needsArrangement } = await labelOrder(context, store, orderId);
  const { parcel } = request;
  try {
    if (needsArrangement) {
      await arrangeShipping(request, pickup);
    }

    if (!(await documentExists(request))) {
      await requestDocument(request);
    }

    const bytes = await requestShopPdf(context, {
      accessToken: store.accessToken,
      shopId: store.externalShopId,
      method: "POST",
      path: "/api/v2/logistics/download_shipping_document",
      json: { shipping_document_type: PDF_DOCUMENT_TYPE, order_list: [parcel] },
    });
    return { bytes, packageId: item?.package_number ?? order.order_sn };
  } catch (error) {
    if (labelWaitingCodes.some((code) => hasMarketplaceCause(error, code))) {
      throw waitForLabel();
    }

    throw error;
  }
}
