import { reopenAbandonedWebhookEvent } from "@sellbridge/database/repositories";
import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import { database } from "@/lib/server/database";
import { enqueueWebhookEvent, retryFailedJob } from "@/lib/server/queues";
import type { ProblemRetry } from "./problem-retry";

const RUNNING_AGAIN =
  "Pronto, o robô está tentando de novo. Se falhar outra vez, o problema volta para esta lista.";

/** What happened, for the notice. */
export interface ProblemRetryOutcome {
  readonly message: string;
}

async function retryWebhookEvent(webhookEventId: string): Promise<ProblemRetryOutcome> {
  const reopened = await reopenAbandonedWebhookEvent(database, {
    id: webhookEventId,
    now: new Date(),
  });
  if (reopened === null) {
    throw notFoundError("Esse aviso de venda não existe mais: avisos somem depois de 30 dias.");
  }
  if (!reopened.pending) {
    return { message: "Esse aviso já foi processado: a venda entrou." };
  }
  await enqueueWebhookEvent(webhookEventId);
  return { message: RUNNING_AGAIN };
}

async function retryJob(queue: string, jobId: string): Promise<ProblemRetryOutcome> {
  const result = await retryFailedJob(queue, jobId);
  if (result === "missing") {
    throw conflictError(
      "O robô não guarda mais essa tarefa. Refaça a ação na tela de origem (o pedido ou o cartão do Bling do fornecedor).",
    );
  }
  if (result === "not_failed") {
    return { message: "Essa tarefa já está rodando de novo." };
  }
  return { message: RUNNING_AGAIN };
}

/**
 * Runs again what a problem is about: the marketplace event the sweep gave up on, or the worker
 * job that failed its last attempt.
 *
 * @throws {AppError} NOT_FOUND when the event is gone; CONFLICT when the job is no longer kept.
 */
export async function runProblemRetry(retry: ProblemRetry): Promise<ProblemRetryOutcome> {
  if (retry.kind === "webhook_event") {
    return retryWebhookEvent(retry.webhookEventId);
  }
  return retryJob(retry.queue, retry.jobId);
}
