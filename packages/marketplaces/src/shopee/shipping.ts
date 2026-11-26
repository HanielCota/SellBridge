import { z } from "zod";
import { LABEL_NOT_READY_CAUSE, hasMarketplaceCause, marketplaceError } from "../errors.ts";
import type { StoreCredentials } from "../types.ts";
import { requestShop, requestShopPdf, type ShopeeContext, type ShopRequest } from "./client.ts";
import type { ShopeeEnvelope } from "./schemas.ts";
import { readOrderPackages } from "./orders.ts";

const PDF_DOCUMENT_TYPE = "NORMAL_AIR_WAYBILL";
const NOT_CREATED = "logistics.shipping_document_should_print_first";
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
          time_slot_list: z
            .array(
              z.object({
                pickup_time_id: z.string().min(1),
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
    "Envie a NF-e do pedido na Central do Vendedor da Shopee e tente emitir a etiqueta de novo.",
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

function arrangement(parameters: z.output<typeof shippingParametersSchema>) {
  const { dropoff, pickup } = parameters.info_needed;
  const addresses = parameters.pickup?.address_list ?? [];
  if (dropoff?.length === 0 && pickup == null && addresses.length === 0) {
    return { dropoff: {} };
  }

  if (
    parameters.dropoff != null ||
    pickup == null ||
    pickup.some((field) => field !== "address_id" && field !== "pickup_time_id")
  ) {
    throw arrangeInSellerCenter();
  }

  const eligible = pickup.includes("pickup_time_id")
    ? addresses.filter((entry) => (entry.time_slot_list?.length ?? 0) > 0)
    : addresses;
  const address = chooseUnambiguous(
    eligible,
    (entry) =>
      entry.address_flag?.some((flag) => flag.toLowerCase() === "default_address") === true,
  );
  if (address === undefined) {
    throw arrangeInSellerCenter();
  }

  const slot = chooseUnambiguous(
    address.time_slot_list ?? [],
    (entry) => entry.flags?.includes("recommended") === true,
  );
  if (slot === undefined && pickup.includes("pickup_time_id")) {
    throw arrangeInSellerCenter();
  }

  return { pickup: { address_id: address.address_id, pickup_time_id: slot?.pickup_time_id } };
}

async function arrangeShipping(request: LabelRequest) {
  try {
    const query = { order_sn: request.parcel.order_sn };
    const parameters = await callLogistics(request, {
      method: "GET",
      path: "/api/v2/logistics/get_shipping_parameter",
      payload: "response",
      schema: shippingParametersSchema,
      query,
    });
    await callLogistics(request, {
      method: "POST",
      path: "/api/v2/logistics/ship_order",
      payload: "top",
      schema: z.object({ request_id: z.string() }),
      json: { ...query, ...arrangement(parameters) },
    });
  } catch (error) {
    if (INVOICE_ERRORS.some((code) => hasMarketplaceCause(error, code))) {
      throw invoiceRequired();
    }

    if (hasMarketplaceCause(error, "logistics.package_already_shipped")) {
      return;
    }

    if (labelWaitingCodes.some((code) => hasMarketplaceCause(error, code))) {
      throw waitForLabel();
    }

    throw error;
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

export async function getShopeeShippingLabel(
  context: ShopeeContext,
  store: StoreCredentials,
  orderId: string,
) {
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
  const request = { context, store, parcel };
  try {
    if (order.order_status === "READY_TO_SHIP" && !ARRANGED.has(item?.logistics_status ?? "")) {
      await arrangeShipping(request);
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
