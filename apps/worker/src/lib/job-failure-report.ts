import {
  type FailedJob,
  finalJobFailureFields,
  hasOwnFailureReport,
  isFinalJobFailure,
  JOB_FAILED_FINAL_EVENT,
} from "@sellbridge/shared/job-failures";
import { logger } from "@sellbridge/shared/logger";

/** The part of a BullMQ job a failure report reads. */
export interface ReportedJob {
  readonly id?: string | undefined;
  readonly name: string;
  readonly attemptsMade: number;
  readonly finishedOn?: number | undefined;
  readonly data: unknown;
}

function isReportedAsProblem(failed: FailedJob): boolean {
  return isFinalJobFailure(failed) && !hasOwnFailureReport(failed);
}

/**
 * A failed attempt that BullMQ will retry is routine (`warn`). The last one is an error, so it
 * reaches the alert webhook and the admin Problemas page, with the reason in Portuguese, unless
 * the queue already reports its own final failures.
 */
export function reportJobFailure(queue: string, job: ReportedJob | undefined, error: Error): void {
  if (job === undefined) {
    logger.warn("job.failed", { queue, error });
    return;
  }
  const failed: FailedJob = {
    queue,
    name: job.name,
    jobId: job.id,
    attemptsMade: job.attemptsMade,
    finishedOn: job.finishedOn,
    data: job.data,
  };
  if (!isReportedAsProblem(failed)) {
    logger.warn("job.failed", { queue, jobId: job.id, attemptsMade: job.attemptsMade, error });
    return;
  }
  logger.error(JOB_FAILED_FINAL_EVENT, { ...finalJobFailureFields(failed), error });
}
