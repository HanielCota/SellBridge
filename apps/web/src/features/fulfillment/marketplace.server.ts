import { and, eq } from "drizzle-orm";
import {
  getMercadoLivreLabel,
  getMercadoLivreLabels,
  getMercadoLivreShipping,
  type MercadoLivreLabelFile,
  type PrintedLabel,
} from "@sellbridge/marketplaces";
import type { LabelFormat } from "@sellbridge/shared/schemas";
import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import { orders, orderShipments, storeConnections } from "@sellbridge/database/schema";
import { isShippingBlocked } from "@/features/fulfillment/shipping-block";
import { database } from "@/lib/server/database";
import { mercadoLivreApiConfig, tokenCipher } from "@/lib/server/marketplaces";

async function shippingAccess(tenantId: string, orderId: string) {
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
  if (row.store.marketplace !== "mercado_livre")
    throw conflictError(
      "Consulta automática e etiqueta de postagem disponíveis para Mercado Livre. Nos demais envios, registre a transportadora e o rastreio manualmente.",
    );
  if (row.store.status !== "connected" || !row.store.accessTokenEnc)
    throw conflictError("Reconecte a loja para consultar o envio");
  if (row.store.expiresAt && row.store.expiresAt.getTime() <= Date.now())
    throw conflictError("Token da loja expirado. Aguarde a renovação ou reconecte a loja.");
  return {
    config: mercadoLivreApiConfig,
    store: {
      externalShopId: row.store.externalShopId,
      accessToken: tokenCipher.decrypt(row.store.accessTokenEnc),
    },
    externalOrderId: row.externalOrderId,
    orderStatus: row.orderStatus,
  };
}
export async function loadMarketplaceShipping(tenantId: string, orderId: string) {
  const access = await shippingAccess(tenantId, orderId);
  return getMercadoLivreShipping(access.config, access.store, access.externalOrderId);
}
/** The store access for one order's label, after the checks every label passes. */
async function labelAccess(tenantId: string, orderId: string) {
  const shipments = await database
    .select({ id: orderShipments.id })
    .from(orderShipments)
    .where(and(eq(orderShipments.tenantId, tenantId), eq(orderShipments.orderId, orderId)));
  if (shipments.length > 1)
    throw conflictError(
      "Este pedido foi dividido entre fornecedores. A etiqueta única do marketplace não pode ser usada em volumes separados; organize a coleta em um único volume ou contrate envios individuais.",
    );
  const access = await shippingAccess(tenantId, orderId);
  if (isShippingBlocked(access.orderStatus)) throw conflictError("Pedido sem liberação para envio");
  return access;
}
/** One order's label in the format asked for, with the marketplace's order number. */
export async function loadMarketplaceLabel(tenantId: string, orderId: string, format: LabelFormat) {
  const access = await labelAccess(tenantId, orderId);
  const label = await getMercadoLivreLabel(
    access.config,
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
  | { kind: "allowed"; orderId: string; access: Awaited<ReturnType<typeof labelAccess>> }
  | { kind: "refused"; orderId: string; error: unknown };

async function labelCheck(tenantId: string, orderId: string): Promise<LabelCheck> {
  try {
    return { kind: "allowed", orderId, access: await labelAccess(tenantId, orderId) };
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
    first.access.config,
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
