/** What a processor needs from a BullMQ job, kept structural so tests need no real job. */
export interface JobContext {
  data: unknown;
  /** Attempts already made before this one (BullMQ `job.attemptsMade`). */
  attemptsMade: number;
  maxAttempts: number;
}

interface BullJob {
  readonly data: unknown;
  readonly attemptsMade: number;
  readonly opts: { readonly attempts?: number };
}

export function toJobContext(job: BullJob): JobContext {
  return { data: job.data, attemptsMade: job.attemptsMade, maxAttempts: job.opts.attempts ?? 1 };
}
