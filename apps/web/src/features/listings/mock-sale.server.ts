import { randomUUID } from "node:crypto";
import {
  encodeMockOrderResource,
  MOCK_SIGNATURE_HEADER,
  signMockWebhook,
} from "@sellbridge/marketplaces";
import { validationError } from "@sellbridge/shared/errors";
import { ESTIMATED_MARKETPLACE_FEE_BPS } from "@sellbridge/shared/finance";
import { percentOfCents } from "@sellbridge/shared/money";
import { environment } from "@/lib/server/environment";

export interface MockSaleInput {
  externalShopId: string;
  externalListingId: string;
  title: string;
  priceCents: number;
}

/** The simulated marketplace refuses to sign webhooks until its secret is configured. */
export function requireMockWebhookSecret(): string {
  const mockWebhookSecret = environment.MOCK_WEBHOOK_SECRET;
  if (mockWebhookSecret === undefined) {
    throw validationError("O marketplace simulado não está configurado (MOCK_WEBHOOK_SECRET)");
  }
  return mockWebhookSecret;
}

/** Raw JSON body of an "orders" webhook for one paid unit of the listing. */
export function buildMockOrderWebhook(sale: MockSaleInput): string {
  const resource = encodeMockOrderResource({
    externalOrderId: `SIM-${randomUUID().slice(0, 8).toUpperCase()}`,
    status: "paid",
    totalCents: sale.priceCents,
    marketplaceFeeCents: percentOfCents(sale.priceCents, ESTIMATED_MARKETPLACE_FEE_BPS),
    buyerName: "Comprador simulado",
    orderedAt: new Date().toISOString(),
    items: [
      {
        externalListingId: sale.externalListingId,
        title: sale.title,
        quantity: 1,
        unitPriceCents: sale.priceCents,
      },
    ],
  });
  return JSON.stringify({
    id: randomUUID(),
    topic: "orders",
    shopId: sale.externalShopId,
    resource,
  });
}

/** Signs the body and posts it to our own webhook endpoint, as the simulated marketplace would. */
export async function sendMockWebhook(rawBody: string, mockWebhookSecret: string): Promise<void> {
  const response = await fetch(new URL("/api/webhooks/mock", environment.APP_URL), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [MOCK_SIGNATURE_HEADER]: signMockWebhook(rawBody, mockWebhookSecret),
    },
    body: rawBody,
  });
  if (!response.ok) {
    throw validationError("O marketplace simulado não conseguiu enviar a venda");
  }
}
