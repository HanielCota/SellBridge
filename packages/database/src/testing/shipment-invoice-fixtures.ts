import { randomUUID } from "node:crypto";
import type { ProductFiscalPatch } from "@sellbridge/shared/product-fiscal";
import type { SupplierFiscalProfile } from "@sellbridge/shared/supplier-fiscal";
import { eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { upsertErpConnection } from "../repositories/erp-connections.ts";
import { setErpInvoicing } from "../repositories/shipment-invoices.ts";
import {
  orderItems,
  orders,
  orderShipments,
  organization,
  storeConnections,
  supplierProducts,
  suppliers,
  tenantProfile,
} from "../schema/index.ts";

/** A supplier in Divinópolis (MG), Simples Nacional, with the usual resale codes. */
export const TEST_SUPPLIER_FISCAL: SupplierFiscalProfile = {
  cnpj: "11222333000181",
  legalName: "Ateliê Divinópolis Confecções Ltda",
  stateRegistration: "0623079040081",
  regime: "simples",
  address: {
    cep: "35500024",
    street: "Rua Goiás",
    number: "120",
    complement: "",
    neighborhood: "Centro",
    city: "Divinópolis",
    state: "MG",
    ibgeCode: "3122306",
  },
  defaults: {
    cfopInState: "5102",
    cfopOutOfState: "6102",
    icmsCode: "102",
    pisCofinsCst: "49",
    origin: 0,
    unit: "UN",
  },
};

export const TEST_PRODUCT_FISCAL: ProductFiscalPatch = { ncm: "64029990", origin: 0, unit: "PAR" };

/** The buyer's delivery address on the parcel: São Paulo, another state than the supplier's. */
export const TEST_INVOICE_ADDRESS = {
  recipient: "Maria Silva",
  street: "Rua das Flores",
  number: "10",
  complement: "Apto 2",
  neighborhood: "Centro",
  city: "São Paulo",
  state: "SP",
  postalCode: "01001-000",
};

interface InvoiceScenarioOptions {
  /** When the supplier turned emission on; null leaves it off. Defaults to an hour ago. */
  invoiceEnabledAt?: Date | null;
  marketplace?: "mock" | "mercado_livre";
  productFiscal?: ProductFiscalPatch;
  supplierFiscal?: SupplierFiscalProfile | null;
}

function required<Row>(row: Row | undefined, what: string): Row {
  if (row === undefined) {
    throw new Error(`${what} not created`);
  }
  return row;
}

async function createReseller(database: Database): Promise<string> {
  const tenantId = randomUUID();
  await database
    .insert(organization)
    .values({ id: tenantId, name: "Revenda", slug: `nfe-${tenantId}`, createdAt: new Date() });
  await database.insert(tenantProfile).values({
    tenantId,
    fullName: "Revenda Teste",
    cnpj: "45723174000110",
    companyName: "Revenda Teste Ltda",
    billingAddress: {
      cep: "30130010",
      street: "Avenida Afonso Pena",
      number: "1000",
      complement: "",
      neighborhood: "Centro",
      city: "Belo Horizonte",
      state: "MG",
    },
  });
  return tenantId;
}

async function createSupplierWithProduct(
  database: Database,
  suffix: string,
  options: InvoiceScenarioOptions,
) {
  const supplier = required(
    (
      await database
        .insert(suppliers)
        .values({
          name: `Fornecedor NF-e ${suffix}`,
          niche: "Teste",
          state: "MG",
          city: "Divinópolis",
          fiscalProfile:
            options.supplierFiscal === undefined ? TEST_SUPPLIER_FISCAL : options.supplierFiscal,
        })
        .returning({ id: suppliers.id })
    )[0],
    "supplier",
  );
  const sku = `NFE-${suffix}`;
  const product = required(
    (
      await database
        .insert(supplierProducts)
        .values({
          supplierId: supplier.id,
          sku,
          title: "Chinelo",
          costCents: 2000,
          suggestedPriceCents: 4990,
          fiscal: options.productFiscal ?? TEST_PRODUCT_FISCAL,
        })
        .returning({ id: supplierProducts.id })
    )[0],
    "product",
  );
  return { supplierId: supplier.id, productId: product.id, sku };
}

async function createStore(
  database: Database,
  input: { tenantId: string; suffix: string; marketplace: "mock" | "mercado_livre" },
): Promise<string> {
  const store = required(
    (
      await database
        .insert(storeConnections)
        .values({
          tenantId: input.tenantId,
          marketplace: input.marketplace,
          externalShopId: `shop-${input.suffix}`,
          shopName: `Loja ${input.suffix}`,
          accessTokenEnc: null,
          refreshTokenEnc: null,
          expiresAt: new Date(Date.now() + 3_600_000),
        })
        .returning({ id: storeConnections.id })
    )[0],
    "store",
  );
  return store.id;
}

async function createPaidOrder(
  database: Database,
  input: {
    tenantId: string;
    suffix: string;
    productId: string;
    marketplace: "mock" | "mercado_livre";
  },
) {
  const storeId = await createStore(database, input);
  const externalOrderId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const order = required(
    (
      await database
        .insert(orders)
        .values({
          tenantId: input.tenantId,
          storeConnectionId: storeId,
          externalOrderId,
          status: "paid",
          totalCents: 9980,
          buyerName: "Maria Silva",
          orderedAt: new Date(),
        })
        .returning({ id: orders.id })
    )[0],
    "order",
  );
  const item = required(
    (
      await database
        .insert(orderItems)
        .values({
          tenantId: input.tenantId,
          orderId: order.id,
          supplierProductId: input.productId,
          title: "Chinelo",
          quantity: 2,
          unitPriceCents: 4990,
          unitCostCents: 2000,
        })
        .returning({ id: orderItems.id })
    )[0],
    "order item",
  );
  return { storeId, orderId: order.id, orderItemId: item.id, externalOrderId };
}

async function createParcel(
  database: Database,
  input: {
    tenantId: string;
    orderId: string;
    supplierId: string;
    orderItemId: string;
    sku: string;
  },
): Promise<string> {
  const shipment = required(
    (
      await database
        .insert(orderShipments)
        .values({
          tenantId: input.tenantId,
          orderId: input.orderId,
          supplierId: input.supplierId,
          address: TEST_INVOICE_ADDRESS,
          items: [
            { orderItemId: input.orderItemId, title: "Chinelo", quantity: 2, sku: input.sku },
          ],
        })
        .returning({ id: orderShipments.id })
    )[0],
    "shipment",
  );
  return shipment.id;
}

async function connectBling(
  database: Database,
  supplierId: string,
  invoiceEnabledAt: Date | null,
): Promise<void> {
  await upsertErpConnection(database, {
    supplierId,
    provider: "bling",
    userId: null,
    tokens: {
      accessTokenEnc: "enc-access",
      refreshTokenEnc: "enc-refresh",
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  if (invoiceEnabledAt !== null) {
    await setErpInvoicing(database, { supplierId, enabled: true, now: invoiceEnabledAt });
  }
}

/**
 * A reseller's paid order forwarded to a supplier with a connected Bling: one parcel with one
 * item (2 × R$ 49,90). Cleanup removes the tenant (and its order) and the supplier.
 */
export async function createInvoiceScenario(
  database: Database,
  options: InvoiceScenarioOptions = {},
) {
  const suffix = randomUUID().slice(0, 8);
  const tenantId = await createReseller(database);
  const { supplierId, productId, sku } = await createSupplierWithProduct(database, suffix, options);
  const order = await createPaidOrder(database, {
    tenantId,
    suffix,
    productId,
    marketplace: options.marketplace ?? "mock",
  });
  const shipmentId = await createParcel(database, { tenantId, supplierId, sku, ...order });
  const enabledAt =
    options.invoiceEnabledAt === undefined
      ? new Date(Date.now() - 3_600_000)
      : options.invoiceEnabledAt;
  await connectBling(database, supplierId, enabledAt);
  async function cleanup(): Promise<void> {
    await database.delete(organization).where(eq(organization.id, tenantId));
    await database.delete(suppliers).where(eq(suppliers.id, supplierId));
  }
  return { tenantId, supplierId, productId, shipmentId, sku, ...order, cleanup };
}
