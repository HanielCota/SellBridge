import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import {
  listings,
  listingTargets,
  organization,
  storeConnections,
} from "@sellbridge/database/schema";
import { encodeMockOrderResource, signMockWebhook } from "@sellbridge/marketplaces/testing";
import { and, eq } from "drizzle-orm";
import { e2eDatabase } from "./database";
import { requireEnvironmentVariable } from "./environment";
import { gotoHydrated } from "./helpers";
import { profileOf } from "./profile-fixtures";

/** Feed a fixture sale through the real webhook/queue/worker path, without a product UI shortcut. */
export async function simulateSale(page: Page, title?: string): Promise<void> {
  const query = title === undefined ? "" : `&query=${encodeURIComponent(title)}`;
  await gotoHydrated(page, `/publicacoes?status=published${query}`);
  const database = e2eDatabase();
  try {
    const [sale] = await database
      .select({
        shopId: storeConnections.externalShopId,
        externalListingId: listingTargets.externalId,
        title: listings.title,
        priceCents: listings.priceCents,
      })
      .from(listings)
      .innerJoin(organization, eq(organization.id, listings.tenantId))
      .innerJoin(listingTargets, eq(listingTargets.listingId, listings.id))
      .innerJoin(storeConnections, eq(storeConnections.id, listingTargets.storeConnectionId))
      .where(
        and(
          eq(organization.slug, profileOf(page)),
          eq(listingTargets.status, "published"),
          title === undefined ? undefined : eq(listings.title, title),
        ),
      )
      .limit(1);
    if (sale === undefined || sale.externalListingId === null)
      throw new Error("A published test listing is required.");
    const rawBody = JSON.stringify({
      id: randomUUID(),
      topic: "orders",
      shopId: sale.shopId,
      resource: encodeMockOrderResource({
        externalOrderId: `SIM-${randomUUID().slice(0, 8).toUpperCase()}`,
        status: "paid",
        totalCents: sale.priceCents,
        marketplaceFeeCents: Math.round(sale.priceCents * 0.14),
        buyerName: "Test Buyer",
        orderedAt: new Date().toISOString(),
        shippingAddress: {
          recipient: "Test Buyer",
          street: "Test Street",
          number: "123",
          complement: "",
          neighborhood: "Centro",
          city: "São Paulo",
          state: "SP",
          postalCode: "01001-000",
        },
        items: [
          {
            externalListingId: sale.externalListingId,
            title: sale.title,
            quantity: 1,
            unitPriceCents: sale.priceCents,
          },
        ],
      }),
    });
    const response = await page.request.post("/api/webhooks/mercado_livre", {
      data: rawBody,
      headers: {
        "content-type": "application/json",
        "x-mock-signature": signMockWebhook(
          rawBody,
          requireEnvironmentVariable("E2E_MARKETPLACE_SECRET"),
        ),
      },
    });
    expect(response.status()).toBe(200);
  } finally {
    await database.$client.end();
  }
}
