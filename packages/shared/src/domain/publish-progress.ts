/**
 * Progress of a bulk publication (item 14.b): how many marketplace jobs finished and how long the
 * rest should take, by the average pace of the jobs already done.
 */

export interface PublishBatchCounts {
  total: number;
  /** Published or failed for good: nothing more will happen to them on their own. */
  finished: number;
  startedAt: Date | null;
  lastFinishedAt: Date | null;
}

export interface PublishProgress {
  done: number;
  total: number;
  percent: number;
  /** Null while no job finished yet: there is no pace to estimate from. */
  remainingMilliseconds: number | null;
}

/**
 * The pace is the time between finished jobs, not each job's own duration: the worker runs
 * several at once, so adding durations up would promise far more time than is left.
 */
function remainingFor(counts: PublishBatchCounts, left: number): number | null {
  if (left === 0) {
    return 0;
  }
  if (counts.finished === 0 || counts.startedAt === null || counts.lastFinishedAt === null) {
    return null;
  }
  const elapsed = Math.max(0, counts.lastFinishedAt.getTime() - counts.startedAt.getTime());
  return Math.round((elapsed / counts.finished) * left);
}

export function estimatePublishProgress(counts: PublishBatchCounts): PublishProgress {
  const total = Math.max(0, counts.total);
  const done = Math.min(Math.max(0, counts.finished), total);
  const left = total - done;
  // Rounded down: 199 of 200 reads 99%, so 100% always means finished.
  const percent = total === 0 ? 100 : Math.floor((done / total) * 100);
  return { done, total, percent, remainingMilliseconds: remainingFor(counts, left) };
}
