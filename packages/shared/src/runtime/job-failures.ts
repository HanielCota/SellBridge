import { autoForwardJobId, erpCatalogExportJobId, QUEUE_NAMES } from "./queues.ts";

type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** The log event of a worker job that failed its last attempt; the admin Problemas page keeps it. */
export const JOB_FAILED_FINAL_EVENT = "job.failed_final";

/** The log event of a marketplace event the sweep stopped retrying and handed to the team. */
export const WEBHOOK_EVENT_ABANDONED_EVENT = "webhook.event_abandoned";

/**
 * Queues whose failures already reach the team their own way: a publication that failed for good
 * is recorded by `listing.publish_failed`, and a marketplace event is retried by the sweep and
 * handed to the team once its retry window closes (`webhook.event_abandoned`).
 */
const QUEUES_WITH_THEIR_OWN_REPORT: ReadonlySet<string> = new Set([
  QUEUE_NAMES.publishListing,
  QUEUE_NAMES.webhookEvents,
]);

/** What stopped, in the team's words, for the title of the problem. */
const FAILURE_REASONS: Readonly<Record<QueueName, string>> = {
  [QUEUE_NAMES.publishListing]: "A publicação do anúncio falhou em todas as tentativas.",
  [QUEUE_NAMES.tokenRefresh]: "A renovação do acesso às lojas e ao Bling falhou.",
  [QUEUE_NAMES.webhookEvents]: "O aviso de venda do marketplace falhou em todas as tentativas.",
  [QUEUE_NAMES.stockPriceSync]:
    "A atualização de estoque e preço nos marketplaces falhou em todas as tentativas.",
  [QUEUE_NAMES.webhookDelivery]: "O envio de avisos aos integradores (API pública) falhou.",
  [QUEUE_NAMES.publishRecovery]: "A recuperação de publicações presas falhou.",
  [QUEUE_NAMES.webhookEventSweep]: "A conferência dos avisos de venda não processados falhou.",
  [QUEUE_NAMES.ticketAutoClose]: "O fechamento automático de chamados parados falhou.",
  [QUEUE_NAMES.shipmentTracking]: "A leitura do rastreio dos pacotes falhou.",
  [QUEUE_NAMES.orderAutoForward]:
    "O encaminhamento automático do pedido ao fornecedor falhou em todas as tentativas. Encaminhe o pedido à mão ou tente de novo.",
  [QUEUE_NAMES.notificationDelivery]: "O envio de e-mails e avisos aos clientes falhou.",
  [QUEUE_NAMES.orderMessageFollowUp]: "O e-mail de aviso de nova mensagem no pedido falhou.",
  [QUEUE_NAMES.erpCatalogExport]:
    "O envio do catálogo do fornecedor ao Bling falhou em todas as tentativas.",
  [QUEUE_NAMES.erpCatalogRead]: "A leitura do catálogo do fornecedor no Bling falhou.",
  [QUEUE_NAMES.erpInvoiceIssue]: "A emissão das notas fiscais pelo Bling falhou.",
  [QUEUE_NAMES.supplierPayments]: "A rodada de pagamentos dos fornecedores falhou.",
  [QUEUE_NAMES.marketplaceClaimSweep]:
    "A conferência das reclamações do Mercado Livre falhou: reclamações novas podem não ter aparecido.",
  [QUEUE_NAMES.supplierApproval]:
    "A nova conferência dos fornecedores que esperam aprovação falhou: confira a fila de aprovação.",
  [QUEUE_NAMES.buyerAddressCheck]:
    "A conferência diária do endereço de compra das lojas do Mercado Livre falhou.",
};

const UNKNOWN_QUEUE_REASON = "Uma tarefa do robô falhou em todas as tentativas.";

/**
 * Jobs that do one thing for one order or supplier: running the same job again is the fix, so
 * the problem offers "Tentar de novo". Recurring rounds run again on their own. The job id is
 * rebuilt from what the job was about: the stored context scrubs long ids like these.
 */
const RETRYABLE_JOB_IDS: Readonly<
  Record<string, (subject: Record<string, string>) => string | null>
> = {
  [QUEUE_NAMES.orderAutoForward]: (subject) =>
    subject.orderId === undefined ? null : autoForwardJobId(subject.orderId),
  [QUEUE_NAMES.erpCatalogExport]: (subject) =>
    subject.supplierId === undefined
      ? null
      : erpCatalogExportJobId({ supplierId: subject.supplierId }),
};

/**
 * The id of the failed job a problem's "Tentar de novo" runs again, from the queue and the ids
 * the problem kept; null when that queue's jobs are not retried by hand or an id is missing.
 */
export function retryableJobIdOf(queue: string, subject: Record<string, unknown>): string | null {
  if (!Object.hasOwn(RETRYABLE_JOB_IDS, queue)) {
    return null;
  }
  const build: (subject: Record<string, string>) => string | null = Reflect.get(
    RETRYABLE_JOB_IDS,
    queue,
  );
  return build(subjectOf(subject));
}

/** The job data fields that name what the job was about; they join the problem's context. */
const SUBJECT_KEYS = [
  "orderId",
  "supplierId",
  "tenantId",
  "storeConnectionId",
  "listingTargetId",
] as const;

export interface FailedJob {
  readonly queue: string;
  readonly jobId: string | undefined;
  readonly attemptsMade: number;
  /** Set by BullMQ only when the job failed for good (no attempt left, or an unrecoverable error). */
  readonly finishedOn: number | undefined;
  readonly data: unknown;
}

/** True once BullMQ will not run the job again on its own. */
export function isFinalJobFailure(job: FailedJob): boolean {
  return job.finishedOn !== undefined;
}

export function hasOwnFailureReport(queue: string): boolean {
  return QUEUES_WITH_THEIR_OWN_REPORT.has(queue);
}

export function jobFailureReason(queue: string): string {
  if (Object.hasOwn(FAILURE_REASONS, queue)) {
    return Reflect.get(FAILURE_REASONS, queue);
  }
  return UNKNOWN_QUEUE_REASON;
}

function subjectOf(data: unknown): Record<string, string> {
  if (typeof data !== "object" || data === null) {
    return {};
  }
  const subject: Record<string, string> = {};
  for (const key of SUBJECT_KEYS) {
    const value: unknown = Reflect.get(data, key);
    if (typeof value === "string" && value.trim() !== "") {
      subject[key] = value;
    }
  }
  return subject;
}

/**
 * The fields of a `job.failed_final` log: the reason for the team, what the job was about and,
 * for a job that can be run again, the queue and job id the "Tentar de novo" button needs. A
 * one-off job gets its own problem (`problemKey`); a recurring round's failures group together.
 */
export function finalJobFailureFields(job: FailedJob): Record<string, unknown> {
  const subject = subjectOf(job.data);
  const retryable = retryableJobIdOf(job.queue, subject) !== null;
  return {
    reason: jobFailureReason(job.queue),
    queue: job.queue,
    jobId: job.jobId,
    attemptsMade: job.attemptsMade,
    retryable,
    ...(retryable ? { problemKey: `${job.queue}:${Object.values(subject).join(":")}` } : {}),
    ...subject,
  };
}
