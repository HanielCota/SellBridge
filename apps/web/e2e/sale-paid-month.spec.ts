import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  organization,
  orderItems,
  orders,
  reportSnapshots,
  storeConnections,
} from "@sellbridge/database/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";
import { e2eDatabase } from "./database";

const database = e2eDatabase();
const externalId = `E2E-PAGO-DEPOIS-${randomUUID()}`;
/** Brazil has had a fixed UTC−3 offset since 2019. */
const BRAZIL_OFFSET_MS = 3 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const now = new Date();
const brazilNow = new Date(now.getTime() - BRAZIL_OFFSET_MS);
/** 00:00 in Brazil of the 1st of this month. */
const monthStart = new Date(
  Date.UTC(brazilNow.getUTCFullYear(), brazilNow.getUTCMonth(), 1) + BRAZIL_OFFSET_MS,
);
/** 15:00 in Brazil on the last day of last month. */
const orderedAt = new Date(monthStart.getTime() - 9 * HOUR_MS);
/** 10:00 in Brazil on the 2nd of this month, or a minute ago early on the 1st. */
const paidAt = new Date(Math.min(monthStart.getTime() + 34 * HOUR_MS, now.getTime() - 60_000));
const previousMonth = new Date(orderedAt.getTime() - BRAZIL_OFFSET_MS).toISOString().slice(0, 7);
const placedOn = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "America/Sao_Paulo",
}).format(orderedAt);

let tenantId = "";
let orderId = "";

async function forgetPreviousMonthReport(): Promise<void> {
  await database
    .delete(reportSnapshots)
    .where(
      and(
        eq(reportSnapshots.scope, "seller"),
        eq(reportSnapshots.ownerId, tenantId),
        eq(reportSnapshots.month, previousMonth),
      ),
    );
}

/** An order of the demo reseller placed on last month's last day, still awaiting payment. */
test.beforeAll(async () => {
  const [tenant] = await database
    .select()
    .from(organization)
    .where(eq(organization.slug, "ana-revendedora-demo"));
  if (!tenant) throw new Error("Seed demo missing");
  tenantId = tenant.id;
  const [store] = await database
    .select()
    .from(storeConnections)
    .where(and(eq(storeConnections.tenantId, tenantId), eq(storeConnections.manual, false)));
  if (!store) throw new Error("Seed store missing");
  const [catalogItem] = await database
    .select({ productId: orderItems.supplierProductId, cost: orderItems.unitCostCents })
    .from(orderItems)
    .where(and(eq(orderItems.tenantId, tenantId), isNotNull(orderItems.supplierProductId)))
    .limit(1);
  if (!catalogItem) throw new Error("Seed sale missing");
  const [created] = await database
    .insert(orders)
    .values({
      tenantId,
      storeConnectionId: store.id,
      externalOrderId: externalId,
      status: "pending",
      totalCents: 10_000,
      marketplaceFeeCents: 1_400,
      buyerName: "Beatriz Lopes",
      orderedAt,
    })
    .returning();
  if (!created) throw new Error("Order missing");
  orderId = created.id;
  await database.insert(orderItems).values({
    tenantId,
    orderId,
    supplierProductId: catalogItem.productId,
    title: "Vestido pago no mês seguinte",
    quantity: 1,
    unitPriceCents: 10_000,
    unitCostCents: catalogItem.cost,
  });
  await forgetPreviousMonthReport();
});

test.afterAll(async () => {
  if (orderId) await database.delete(orders).where(eq(orders.id, orderId));
  if (tenantId) await forgetPreviousMonthReport();
  await database.$client.end();
});

test("a sale paid after its month ends stays unpaid in that month and counts where it was paid", async ({
  page,
}) => {
  const unpaidCase = page.getByText(`Pedido ${externalId}`);
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, `/financeiro/relatorio?mes=${previousMonth}`);
  await expect(page.getByText("Ainda não pago", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Aguardando pagamento" }).click();
  await expect(unpaidCase).toBeVisible();

  await database.update(orders).set({ status: "paid", paidAt }).where(eq(orders.id, orderId));

  // The closed month was kept on its first read: the order is still unpaid there.
  await gotoHydrated(page, `/financeiro/relatorio?mes=${previousMonth}`);
  await page.getByRole("tab", { name: "Aguardando pagamento" }).click();
  await expect(unpaidCase).toBeVisible();
  // The sale counts on the day it was paid, saying when it was placed.
  await gotoHydrated(page, `/financeiro?period=30d&query=${externalId}`);
  const statement = page.getByLabel("Financeiro por pedido");
  await expect(statement.getByText(`pedido em ${placedOn}`)).toBeVisible();
});
