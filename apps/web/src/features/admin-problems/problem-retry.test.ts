import { autoForwardJobId, erpCatalogExportJobId, QUEUE_NAMES } from "@sellbridge/shared/queues";
import { describe, expect, it } from "vitest";
import { problemRetryOf } from "./problem-retry";

const ID = "6f1c2d3e-4b5a-4c6d-8e7f-901234567890";

describe("problem retry", () => {
  it("runs again a marketplace event the sweep handed to the team", () => {
    expect(problemRetryOf("webhook.event_abandoned", { webhookEventId: ID })).toEqual({
      kind: "webhook_event",
      webhookEventId: ID,
    });
  });

  it("runs again the failed job of an auto-forward or a Bling catalog send", () => {
    expect(
      problemRetryOf("job.failed_final", { queue: QUEUE_NAMES.orderAutoForward, orderId: ID }),
    ).toEqual({ kind: "job", queue: QUEUE_NAMES.orderAutoForward, jobId: autoForwardJobId(ID) });
    expect(
      problemRetryOf("job.failed_final", { queue: QUEUE_NAMES.erpCatalogExport, supplierId: ID }),
    ).toEqual({
      kind: "job",
      queue: QUEUE_NAMES.erpCatalogExport,
      jobId: erpCatalogExportJobId({ supplierId: ID }),
    });
  });

  it("offers nothing for recurring rounds, other problems or missing ids", () => {
    expect(problemRetryOf("job.failed_final", { queue: QUEUE_NAMES.supplierPayments })).toBeNull();
    expect(problemRetryOf("job.failed_final", { queue: QUEUE_NAMES.orderAutoForward })).toBeNull();
    expect(problemRetryOf("webhook.event_abandoned", {})).toBeNull();
    expect(problemRetryOf("payments.provider_stuck", { queue: "x" })).toBeNull();
  });
});
