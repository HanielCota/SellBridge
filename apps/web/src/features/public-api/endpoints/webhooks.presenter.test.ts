import type {
  WebhookDeliverySummary,
  WebhookEndpointSummary,
} from "@sellbridge/database/repositories";
import { describe, expect, it } from "vitest";
import {
  presentWebhookDelivery,
  presentWebhookEndpoint,
  webhookDeliverySchema,
  webhookEndpointSchema,
} from "./webhooks.presenter";

const endpoint: WebhookEndpointSummary = {
  id: "00000000-0000-4000-8000-000000000001",
  url: "https://erp.example.com/hooks",
  description: null,
  eventTypes: ["order.created", "tipo.antigo"],
  disabledAt: new Date("2026-01-02T00:00:00Z"),
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

const delivery: WebhookDeliverySummary = {
  id: "00000000-0000-4000-8000-000000000002",
  eventId: "00000000-0000-4000-8000-000000000003",
  eventType: "order.created",
  status: "succeeded",
  attempts: 2,
  lastStatusCode: 200,
  lastError: null,
  nextAttemptAt: new Date("2026-01-01T00:00:30Z"),
  deliveredAt: new Date("2026-01-01T00:00:31Z"),
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

describe("webhook presenters", () => {
  it("presents an endpoint without its secret and with known event types only", () => {
    const presented = presentWebhookEndpoint(endpoint);
    expect(presented).toEqual({
      id: endpoint.id,
      url: endpoint.url,
      description: null,
      eventTypes: ["order.created"],
      enabled: false,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(webhookEndpointSchema.parse(presented)).toEqual(presented);
  });

  it("shows the next attempt only while the delivery is pending", () => {
    const presented = presentWebhookDelivery(delivery);
    expect(presented.nextAttemptAt).toBeNull();
    expect(presented.deliveredAt).toBe("2026-01-01T00:00:31.000Z");
    expect(webhookDeliverySchema.parse(presented)).toEqual(presented);
    expect(presentWebhookDelivery({ ...delivery, status: "pending" }).nextAttemptAt).toBe(
      "2026-01-01T00:00:30.000Z",
    );
  });
});
