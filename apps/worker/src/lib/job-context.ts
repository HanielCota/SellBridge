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

/** Whether this run is the job's last: a failure now is final. */
export function isLastAttempt(job: BullJob): boolean {
  const { attemptsMade, maxAttempts } = toJobContext(job);
  return attemptsMade + 1 >= maxAttempts;
}
