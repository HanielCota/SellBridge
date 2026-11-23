import { scrubText } from "./problem-capture.ts";
import { describe, expect, it } from "vitest";
import {
  finalJobFailureFields,
  jobFailureReason,
  retryableJobIdOf,
  listingIdsForProblem,
} from "./job-failures.ts";
import {
  autoForwardJobId,
  erpCatalogExportJobId,
  QUEUE_NAMES,
  RETURN_DEADLINES_JOB_NAME,
} from "./queues.ts";

const ID = "6f1c2d3e-4b5a-4c6d-8e7f-901234567890";

describe("job failures", () => {
  it("rebuilds the job id of a one-off job from what it was about", () => {
    expect(retryableJobIdOf(QUEUE_NAMES.orderAutoForward, { orderId: ID })).toBe(
      autoForwardJobId(ID),
    );
    expect(retryableJobIdOf(QUEUE_NAMES.erpCatalogExport, { supplierId: ID })).toBe(
      erpCatalogExportJobId({ supplierId: ID }),
    );
  });

  it("offers no retry for recurring rounds or a job missing its id", () => {
    expect(retryableJobIdOf(QUEUE_NAMES.supplierPayments, { supplierId: ID })).toBeNull();
    expect(retryableJobIdOf(QUEUE_NAMES.orderAutoForward, {})).toBeNull();
    expect(retryableJobIdOf(QUEUE_NAMES.orderAutoForward, { orderId: "  " })).toBeNull();
  });

  it("names every queue in Portuguese and falls back for an unknown one", () => {
    for (const queue of Object.values(QUEUE_NAMES)) {
      expect(jobFailureReason(queue)).toMatch(/falhou/);
    }
    expect(jobFailureReason("unknown-queue")).toBe(
      "Uma tarefa do robô falhou em todas as tentativas.",
    );
  });

  it("names the return deadlines round apart from the ticket round that shares its queue", () => {
    const failure = {
      queue: QUEUE_NAMES.ticketAutoClose,
      jobId: "repeat:1",
      attemptsMade: 3,
      finishedOn: 1,
    };

    const returns = finalJobFailureFields({
      ...failure,
      name: RETURN_DEADLINES_JOB_NAME,
      data: {},
    });
    const tickets = finalJobFailureFields({ ...failure, name: "close-idle-tickets", data: {} });

    expect(returns.reason).toMatch(/prazos de devolução/);
    expect(tickets.reason).toBe("O fechamento automático de chamados parados falhou.");
  });
});

describe("listingIdsForProblem", () => {
  it("keeps numeric listing ids readable after the personal-data scrubbing", () => {
    const ids = listingIdsForProblem(["22912345678", "MLB1"]);

    expect(scrubText(ids)).toBe("id_22912345678, id_MLB1");
  });

  it("names 20 listings and counts the rest", () => {
    const ids = Array.from({ length: 22 }, (_, index) => `MLB${index}`);

    expect(listingIdsForProblem(ids)).toMatch(/id_MLB19 and 2 more$/);
  });
});
