import { and, eq } from "drizzle-orm";
import {
  type ConfirmedPickup,
  getMercadoLivreLabel,
  getMercadoLivreLabels,
  getMercadoLivreShipping,
  getShopeeShippingLabel,
  getTikTokShopShippingLabel,
  readShopeePickupOptions,
  sendMercadoLivreSaleInvoice,
  type MercadoLivreLabelFile,
  type PrintedLabel,
  type StoreCredentials,
} from "@sellbridge/marketplaces";
import type { LabelFormat } from "@sellbridge/shared/schemas";
import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import {
  BATCH_LABEL_MARKETPLACE,
  individualLabelMessage,
  isLabelMarketplace,
} from "@sellbridge/shared/supplier-order-labels";
import { findOnBehalfLabelParcels, findOrderLabelParcels } from "@sellbridge/database/repositories";
import { orders, orderShipments, storeConnections, suppliers } from "@sellbridge/database/schema";
import { readSupplierFiscalProfile } from "@sellbridge/shared/supplier-fiscal";
import { onBehalfLabelRefusal } from "@sellbridge/shared/reseller-invoice";
import { labelSharingRefusal } from "@/features/fulfillment/label-sharing";
import type { PickupConfirmation, PickupMissing } from "@/features/fulfillment/pickup-page";
import {
  type SupplierAddress,
  supplierAddressLines,
  supplierPickup,
} from "@/features/fulfillment/shopee-pickup";
import { saleNoteXmlRefusal } from "@/features/fulfillment/sale-note-xml";
import { isShippingBlocked } from "@/features/fulfillment/shipping-block";
import { database } from "@/lib/server/database";
import {
  mercadoLivreApiConfig,
  shopeeApiConfig,
  tiktokShopApiConfig,
  tokenCipher,
} from "@/lib/server/marketplaces";

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
      "Etiqueta de postagem disponível para Mercado Livre, Shopee e TikTok Shop. Nos demais envios, registre a transportadora e o rastreio manualmente.",
    );
  if (isShippingBlocked(row.orderStatus)) throw conflictError("Pedido sem liberação para envio");
  const notesRefusal = onBehalfLabelRefusal(
    await findOnBehalfLabelParcels(database, { tenantId, orderId }),
    row.store.marketplace,
    orderId,
  );
  if (notesRefusal !== null) throw conflictError(notesRefusal);
  return {
    marketplace: row.store.marketplace,
    store: storeCredentials(row.store),
    shopName: row.store.shopName,
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

async function pdfLabel(
  access: LabelAccess,
  format: LabelFormat,
  pickup: ConfirmedPickup | undefined,
): Promise<OrderLabel> {
  if (format !== "pdf") {
    throw conflictError("Escolha a impressora comum para emitir a etiqueta em PDF.");
  }

  const label =
    access.marketplace === "shopee"
      ? await getShopeeShippingLabel(shopeeApiConfig, access.store, access.externalOrderId, pickup)
      : await getTikTokShopShippingLabel(tiktokShopApiConfig, access.store, access.externalOrderId);
  return {
    file: { format: "pdf", bytes: label.bytes },
    shipmentId: label.packageId,
    externalOrderId: access.externalOrderId,
  };
}

/** How a label is asked for: its format, and whether a Shopee one may be generated now. */
export interface LabelAsk {
  readonly format: LabelFormat;
  readonly allowGeneration: boolean;
  /** The Shopee pickup the requester confirmed (`shopeePickupStep`). */
  readonly pickup?: ConfirmedPickup | undefined;
}

/** One order's label in the format asked for, with the marketplace's order number. */
export async function loadMarketplaceLabel(
  tenantId: string,
  orderId: string,
  { format, allowGeneration, pickup }: LabelAsk,
): Promise<OrderLabel> {
  const access = await labelAccess(tenantId, orderId);
  if (access.marketplace === "shopee" && !allowGeneration) {
    throw conflictError("Gere a etiqueta da Shopee pelo botão da página do pedido.");
  }

  if (access.marketplace !== BATCH_LABEL_MARKETPLACE) {
    return pdfLabel(access, format, pickup);
  }

  const label = await getMercadoLivreLabel(
    mercadoLivreApiConfig,
    access.store,
    access.externalOrderId,
    format,
  );
  return { ...label, externalOrderId: access.externalOrderId };
}

/** The address of the one supplier that ships the order; null when it has none on file. */
async function orderSupplierAddress(
  tenantId: string,
  orderId: string,
): Promise<SupplierAddress | null> {
  const rows = await database
    .selectDistinct({ fiscalProfile: suppliers.fiscalProfile })
    .from(orderShipments)
    .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
    .where(and(eq(orderShipments.orderId, orderId), eq(orderShipments.tenantId, tenantId)));
  const [row] = rows;
  if (rows.length > 1) {
    throw conflictError(
      "Este pedido sai de mais de um fornecedor. Organize as coletas na Central do Vendedor da Shopee.",
    );
  }
  return row === undefined ? null : (readSupplierFiscalProfile(row.fiscalProfile)?.address ?? null);
}

/** What the label request does about the carrier's pickup before asking Shopee for the label. */
export type ShopeePickupStep =
  | { kind: "proceed"; pickup: ConfirmedPickup | undefined }
  | { kind: "confirm"; confirmation: Omit<PickupConfirmation, "form" | "action"> }
  | { kind: "missing"; missing: PickupMissing };

/**
 * The pickup rule (decision of 2026-11-27): the carrier picks the parcel up at the supplier's
 * address, one of the reseller's Shopee pickup addresses, after the requester confirms it. A
 * confirmation is taken only while it still names the address and slot Shopee offers there.
 *
 * @throws {AppError} CONFLICT when the supplier's address is not on file, or several suppliers
 * ship the order.
 */
export async function shopeePickupStep(
  tenantId: string,
  orderId: string,
  confirmed: ConfirmedPickup | null,
): Promise<ShopeePickupStep> {
  const access = await labelAccess(tenantId, orderId);
  if (access.marketplace !== "shopee") {
    return { kind: "proceed", pickup: undefined };
  }
  const options = await readShopeePickupOptions(
    shopeeApiConfig,
    access.store,
    access.externalOrderId,
  );
  if (options.kind === "not_needed") {
    return { kind: "proceed", pickup: undefined };
  }
  const supplierAddress = await orderSupplierAddress(tenantId, orderId);
  if (supplierAddress === null) {
    throw conflictError(
      "O endereço da empresa do fornecedor ainda não está no SellBridge, então não dá para agendar a coleta. O fornecedor cadastra em Marca, em Dados fiscais da empresa.",
    );
  }
  const order = { externalOrderId: access.externalOrderId, shopName: access.shopName };
  const match = supplierPickup(options.addresses, supplierAddress);
  if (match.kind !== "match") {
    const lines = supplierAddressLines(supplierAddress);
    return {
      kind: "missing",
      missing: { ...order, supplierAddress: lines, ambiguous: match.kind === "ambiguous" },
    };
  }
  const { choice } = match;
  if (confirmed?.addressId === choice.addressId && confirmed.pickupTimeId === choice.pickupTimeId) {
    return { kind: "proceed", pickup: confirmed };
  }
  return { kind: "confirm", confirmation: { ...order, choice } };
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
      return {
        kind: "refused",
        orderId,
        error: conflictError(
          individualLabelMessage(access.marketplace) ?? "Abra o pedido para imprimir a etiqueta.",
        ),
      };
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
 * Sends the reseller's own sale note (its XML) to the Mercado Livre shipment of the parcel's
 * order, where the label needs it. Other marketplaces take the typed key instead.
 *
 * @throws {AppError} NOT_FOUND when the parcel is not the reseller's; CONFLICT when the order is not
 * on Mercado Livre or the store must be reconnected; EXTERNAL_PROVIDER when Mercado Livre refuses
 * the note, with the reason.
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
  const refusal = saleNoteXmlRefusal(row.store.marketplace);
  if (refusal !== null) {
    throw conflictError(refusal);
  }
  await sendMercadoLivreSaleInvoice(mercadoLivreApiConfig, storeCredentials(row.store), {
    orderId: row.externalOrderId,
    accessKey: input.accessKey,
    xml: input.xml,
  });
}
