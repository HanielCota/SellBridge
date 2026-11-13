import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  organization,
  orderItems,
  orders,
  orderShipments,
  shipmentInvoices,
  storeConnections,
} from "@sellbridge/database/schema";
import { and, eq } from "drizzle-orm";
import { E2E_INVOICE_FILES } from "./bling-invoice.fixture";
import { forwardableProduct } from "./catalog-fixtures";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";
import { e2eDatabase } from "./database";

const database = e2eDatabase();
const externalId = `E2E-NFE-${randomUUID().slice(0, 8)}`;
const ACCESS_KEY = "31261111222333000181550010000012341000012345";
let orderId = "";

/** A paid order of the demo reseller, forwarded, whose note the supplier's Bling authorized. */
async function seedOrderWithAuthorizedNote(): Promise<string> {
  const [tenant] = await database
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, "ana-revendedora-demo"));
  const [store] = await database
    .select({ id: storeConnections.id })
    .from(storeConnections)
    .where(
      and(eq(storeConnections.tenantId, tenant?.id ?? ""), eq(storeConnections.manual, false)),
    );
  const product = await forwardableProduct(database);
  if (tenant === undefined || store === undefined || product === undefined) {
    throw new Error("Seed demo missing");
  }
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: tenant.id,
      storeConnectionId: store.id,
      externalOrderId: externalId,
      status: "paid",
      buyerName: "Juliana Costa",
      orderedAt: new Date(),
      totalCents: 9900,
    })
    .returning({ id: orders.id });
  if (order === undefined) throw new Error("Order missing");
  const [item] = await database
    .insert(orderItems)
    .values({
      tenantId: tenant.id,
      orderId: order.id,
      supplierProductId: product.id,
      title: product.title,
      quantity: 1,
      unitPriceCents: 9900,
      unitCostCents: product.costCents,
    })
    .returning({ id: orderItems.id });
  if (item === undefined) throw new Error("Item missing");
  const [shipment] = await database
    .insert(orderShipments)
    .values({
      tenantId: tenant.id,
      orderId: order.id,
      supplierId: product.supplierId,
      status: "forwarded",
      address: {
        recipient: "Juliana Costa",
        street: "Rua das Flores",
        number: "10",
        complement: "",
        neighborhood: "Centro",
        city: "São Paulo",
        state: "SP",
        postalCode: "01001-000",
      },
      items: [{ orderItemId: item.id, title: product.title, sku: product.sku, quantity: 1 }],
    })
    .returning({ id: orderShipments.id });
  if (shipment === undefined) throw new Error("Shipment missing");
  await database.insert(shipmentInvoices).values({
    shipmentId: shipment.id,
    supplierId: product.supplierId,
    provider: "bling",
    status: "authorized",
    number: "1234",
    series: "1",
    accessKey: ACCESS_KEY,
    authorizedAt: new Date("2026-11-12T13:42:00Z"),
  });
  return order.id;
}

test.beforeAll(async () => {
  orderId = await seedOrderWithAuthorizedNote();
});

test.afterAll(async () => {
  if (orderId !== "") await database.delete(orders).where(eq(orders.id, orderId));
  await database.$client.end();
});

test("o revendedor vê a nota fiscal do pacote e baixa o DANFE e o XML", async ({ page }) => {
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, `/pedidos/${orderId}`);

  const note = page.getByRole("region", { name: "Nota fiscal" });
  await expect(note).toBeVisible();
  await expect(note.getByText("Nota 1234 · série 1")).toBeVisible();
  await expect(note.getByText(/Nota emitida · 12\/11\/2026/)).toBeVisible();
  await expect(note.getByText("3126 1111 2223 3300")).toBeVisible();

  const danfe = page.waitForEvent("download");
  await note.getByRole("link", { name: "Baixar DANFE (PDF)" }).click();
  const danfeFile = await danfe;
  expect(danfeFile.suggestedFilename()).toBe("danfe-1234.pdf");
  expect(await readFile(await danfeFile.path(), "utf8")).toBe(E2E_INVOICE_FILES.pdf);

  const xml = page.waitForEvent("download");
  await note.getByRole("link", { name: "Baixar XML" }).click();
  const xmlFile = await xml;
  expect(xmlFile.suggestedFilename()).toBe("nfe-1234.xml");
  expect(await readFile(await xmlFile.path(), "utf8")).toBe(E2E_INVOICE_FILES.xml);
});

test("sem entrar na conta, ninguém baixa a nota", async ({ request }) => {
  const response = await request.get(
    `/api/pedidos/${orderId}/nota-fiscal?envio=${randomUUID()}&arquivo=xml`,
    { maxRedirects: 0 },
  );

  expect(response.status()).toBeGreaterThanOrEqual(400);
  expect(response.headers()["content-type"]).toContain("text/html");
});
