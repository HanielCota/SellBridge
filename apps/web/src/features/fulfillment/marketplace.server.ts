import { and, eq } from "drizzle-orm";
import {
  getMercadoLivreLabel,
  getMercadoLivreLabels,
  getMercadoLivreShipping,
  getTikTokShopShippingLabel,
  sendMercadoLivreSaleInvoice,
  type MercadoLivreLabelFile,
  type PrintedLabel,
  type StoreCredentials,
} from "@sellbridge/marketplaces";
import type { LabelFormat } from "@sellbridge/shared/schemas";
import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import {
  BATCH_LABEL_MARKETPLACE,
  isLabelMarketplace,
} from "@sellbridge/shared/supplier-order-labels";
import { findOnBehalfLabelParcels, findOrderLabelParcels } from "@sellbridge/database/repositories";
import { orders, orderShipments, storeConnections } from "@sellbridge/database/schema";
import { onBehalfLabelRefusal } from "@sellbridge/shared/reseller-invoice";
import { labelSharingRefusal } from "@/features/fulfillment/label-sharing";
import { isShippingBlocked } from "@/features/fulfillment/shipping-block";
import { database } from "@/lib/server/database";
import { mercadoLivreApiConfig, tiktokShopApiConfig, tokenCipher } from "@/lib/server/marketplaces";

const TIKTOK_SHOP_BATCH_REFUSAL =
  "A etiqueta do TikTok Shop sai uma por vez: abra o pedido e imprima por lá.";

async function orderStore(tenantId: string, orderId: string) {
  const [row] = await database
    .select({
      externalOrderId: orders.externalOrderId,
      orderStatus: orders.status,
      store: storeConnections,
    })
    .from(orders)
    .innerJoin(storeConnections, eq(storeConnections.id, orders.storeConnectionId))
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.tenantId, tenantId),
        eq(storeConnections.tenantId, tenantId),
      ),
    );
  if (!row) throw notFoundError("Pedido não encontrado");
  return row;
}

function storeCredentials(store: typeof storeConnections.$inferSelect): StoreCredentials {
  if (store.status !== "connected" || !store.accessTokenEnc)
    throw conflictError("Reconecte a loja para consultar o envio");
  if (store.expiresAt && store.expiresAt.getTime() <= Date.now())
    throw conflictError("Token da loja expirado. Aguarde a renovação ou reconecte a loja.");
  return {
    externalShopId: store.externalShopId,
    accessToken: tokenCipher.decrypt(store.accessTokenEnc),
  };
}

async function shippingAccess(tenantId: string, orderId: string) {
  const row = await orderStore(tenantId, orderId);
  if (row.store.marketplace !== "mercado_livre")
    throw conflictError(
      "Consulta automática do envio disponível para Mercado Livre. Nos demais envios, registre a transportadora e o rastreio manualmente.",
    );
  return { store: storeCredentials(row.store), externalOrderId: row.externalOrderId };
}
export async function loadMarketplaceShipping(tenantId: string, orderId: string) {
  const access = await shippingAccess(tenantId, orderId);
  return getMercadoLivreShipping(mercadoLivreApiConfig, access.store, access.externalOrderId);
}
/** The store access for one order's label, after the checks every label passes. */
async function labelAccess(tenantId: string, orderId: string) {
  const refusal = labelSharingRefusal(await findOrderLabelParcels(database, tenantId, orderId));
  if (refusal !== null) throw conflictError(refusal);
  const row = await orderStore(tenantId, orderId);
  if (!isLabelMarketplace(row.store.marketplace))
    throw conflictError(
      "Etiqueta de postagem disponível para Mercado Livre e TikTok Shop. Nos demais envios, registre a transportadora e o rastreio manualmente.",
    );
  if (isShippingBlocked(row.orderStatus)) throw conflictError("Pedido sem liberação para envio");
  const notesRefusal = onBehalfLabelRefusal(
    await findOnBehalfLabelParcels(database, { tenantId, orderId }),
    row.store.marketplace,
  );
  if (notesRefusal !== null) throw conflictError(notesRefusal);
  return {
    marketplace: row.store.marketplace,
    store: storeCredentials(row.store),
    externalOrderId: row.externalOrderId,
  };
}

/** One order's label file, with the marketplace's shipment (or package) and order numbers. */
export interface OrderLabel {
  file: { format: LabelFormat; bytes: Uint8Array<ArrayBuffer> };
  shipmentId: string;
  externalOrderId: string;
}

type LabelAccess = Awaited<ReturnType<typeof labelAccess>>;

/** TikTok Shop hands out only a PDF link, which the connector downloads. */
async function tiktokShopLabel(access: LabelAccess, format: LabelFormat): Promise<OrderLabel> {
  if (format !== "pdf")
    throw conflictError("A etiqueta do TikTok Shop sai só em PDF. Escolha a impressora comum.");
  const label = await getTikTokShopShippingLabel(
    tiktokShopApiConfig,
    access.store,
    access.externalOrderId,
  );
  return {
    file: { format: "pdf", bytes: label.bytes },
    shipmentId: label.packageId,
    externalOrderId: access.externalOrderId,
  };
}

/** One order's label in the format asked for, with the marketplace's order number. */
export async function loadMarketplaceLabel(
  tenantId: string,
  orderId: string,
  format: LabelFormat,
): Promise<OrderLabel> {
  const access = await labelAccess(tenantId, orderId);
  if (access.marketplace === "tiktok_shop") {
    return tiktokShopLabel(access, format);
  }
  const label = await getMercadoLivreLabel(
    mercadoLivreApiConfig,
    access.store,
    access.externalOrderId,
    format,
  );
  return { ...label, externalOrderId: access.externalOrderId };
}

/** What a batch of one store's labels gave, in this system's order ids. */
export interface StoreLabelBatch {
  file: MercadoLivreLabelFile | null;
  printed: PrintedLabel[];
  refused: { orderId: string; error: unknown }[];
}

type LabelCheck =
  | { kind: "allowed"; orderId: string; access: LabelAccess }
  | { kind: "refused"; orderId: string; error: unknown };

/** Batches are Mercado Livre's: one `shipment_labels` call prints a whole store at once. */
async function labelCheck(tenantId: string, orderId: string): Promise<LabelCheck> {
  try {
    const access = await labelAccess(tenantId, orderId);
    if (access.marketplace !== BATCH_LABEL_MARKETPLACE) {
      return { kind: "refused", orderId, error: conflictError(TIKTOK_SHOP_BATCH_REFUSAL) };
    }
    return { kind: "allowed", orderId, access };
  } catch (error) {
    return { kind: "refused", orderId, error };
  }
}

/**
 * The labels of several orders of one reseller store in a single file. An order that fails a
 * check, or whose label the marketplace refuses, is reported and never fails the others.
 */
export async function loadMarketplaceLabels(
  tenantId: string,
  orderIds: readonly string[],
  format: LabelFormat,
): Promise<StoreLabelBatch> {
  const checks = await Promise.all(
    orderIds.map(async (orderId) => await labelCheck(tenantId, orderId)),
  );
  const allowed = checks.flatMap((check) => (check.kind === "allowed" ? [check] : []));
  const refused = checks.flatMap((check) =>
    check.kind === "refused" ? [{ orderId: check.orderId, error: check.error }] : [],
  );
  const [first] = allowed;
  if (first === undefined) {
    return { file: null, printed: [], refused };
  }
  if (
    allowed.some((check) => check.access.store.externalShopId !== first.access.store.externalShopId)
  )
    throw conflictError("Imprima juntas só as etiquetas de uma mesma loja");
  const orderIdByExternal = new Map(
    allowed.map((check) => [check.access.externalOrderId, check.orderId]),
  );
  const batch = await getMercadoLivreLabels(
    mercadoLivreApiConfig,
    first.access.store,
    allowed.map((check) => check.access.externalOrderId),
    format,
  );
  // Mercado Livre answers with the ids it was asked for: any other id is a bug, never skipped.
  const internal = (externalOrderId: string) => {
    const orderId = orderIdByExternal.get(externalOrderId);
    if (orderId === undefined) {
      throw new Error(`Label batch answered for an order it was not asked for: ${externalOrderId}`);
    }
    return orderId;
  };
  return {
    file: batch.file,
    printed: batch.printed.map((label) => ({ ...label, orderId: internal(label.orderId) })),
    refused: [
      ...refused,
      ...batch.refused.map((item) => ({ orderId: internal(item.orderId), error: item.error })),
    ],
  };
}

/**
 * Sends the reseller's own sale note (its XML) to the marketplace of the parcel's order, where the
 * label needs it. Only Mercado Livre asks for it; elsewhere there is nothing to send.
 *
 * @throws {AppError} NOT_FOUND when the parcel is not the reseller's; CONFLICT when the store must
 * be reconnected; EXTERNAL_PROVIDER when Mercado Livre refuses the note, with the reason.
 */
export async function sendResellerSaleNoteToMarketplace(
  tenantId: string,
  input: { shipmentId: string; accessKey: string; xml: string },
): Promise<void> {
  const [parcel] = await database
    .select({ orderId: orderShipments.orderId })
    .from(orderShipments)
    .where(and(eq(orderShipments.id, input.shipmentId), eq(orderShipments.tenantId, tenantId)));
  if (parcel === undefined) throw notFoundError("Pedido não encontrado");
  const row = await orderStore(tenantId, parcel.orderId);
  if (row.store.marketplace !== "mercado_livre") {
    return;
  }
  await sendMercadoLivreSaleInvoice(mercadoLivreApiConfig, storeCredentials(row.store), {
    orderId: row.externalOrderId,
    accessKey: input.accessKey,
    xml: input.xml,
  });
}
