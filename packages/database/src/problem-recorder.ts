import { addProblemLogListener, type ProblemLogEntry } from "@sellbridge/shared/logger";
import type { ProblemService } from "@sellbridge/shared/problem-areas";
import { type CapturedProblem, captureProblem } from "@sellbridge/shared/problem-capture";
import type { Database } from "./client.ts";
import {
  type ProblemOccurrence,
  pruneProblemEvents,
  recordProblems,
} from "./repositories/problem-events.ts";

export interface ProblemRecorderOptions {
  service: ProblemService;
  now?: () => Date;
  flushIntervalMilliseconds?: number;
  pruneIntervalMilliseconds?: number;
  /** Problems written per flush; beyond it they are counted as dropped. */
  maximumBatch?: number;
  /** Where the recorder reports its own failures; never the logger, which would feed it back. */
  reportFailure?: (line: string) => void;
}

export interface ProblemRecorder {
  /** Writes what is buffered now (tests, shutdown). Never throws. */
  flush: () => Promise<void>;
  /** Stops listening and the timer; what is still buffered is dropped. */
  stop: () => void;
}

const DEFAULT_FLUSH_INTERVAL_MILLISECONDS = 2000;
const DEFAULT_PRUNE_INTERVAL_MILLISECONDS = 60 * 60 * 1000;
const DEFAULT_MAXIMUM_BATCH = 100;
/** One failure line per minute at most: a database outage must not flood stderr. */
const FAILURE_REPORT_INTERVAL_MILLISECONDS = 60 * 1000;

function writeToStderr(line: string): void {
  process.stderr.write(`${line}\n`);
}

class ProblemBuffer {
  readonly #pending = new Map<string, ProblemOccurrence>();
  readonly #maximum: number;
  #dropped = 0;

  constructor(maximum: number) {
    this.#maximum = maximum;
  }

  add(problem: CapturedProblem): void {
    const existing = this.#pending.get(problem.fingerprint);
    if (existing !== undefined) {
      this.#pending.set(problem.fingerprint, { problem, count: existing.count + 1 });
      return;
    }
    if (this.#pending.size >= this.#maximum) {
      this.#dropped += 1;
      return;
    }
    this.#pending.set(problem.fingerprint, { problem, count: 1 });
  }

  /** Empties the buffer, returning what it held and how many problems did not fit. */
  take(): { occurrences: ProblemOccurrence[]; dropped: number } {
    const taken = { occurrences: [...this.#pending.values()], dropped: this.#dropped };
    this.#pending.clear();
    this.#dropped = 0;
    return taken;
  }
}

/** Why a write failed, without the message: a failed query's message carries its values. */
function failureKind(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String(error.code);
  }
  return error instanceof Error ? error.name : "unknown";
}

/** Writes the buffer to the database; one write at a time, never throwing. */
class ProblemWriter {
  readonly #database: Database;
  readonly #buffer: ProblemBuffer;
  readonly #now: () => Date;
  readonly #pruneInterval: number;
  readonly #reportFailure: (line: string) => void;
  readonly #service: ProblemService;
  #lastFailureReportAt = Number.NEGATIVE_INFINITY;
  #lastPruneAt = Number.NEGATIVE_INFINITY;
  #writing: Promise<void> | null = null;

  constructor(database: Database, buffer: ProblemBuffer, options: ProblemRecorderOptions) {
    this.#database = database;
    this.#buffer = buffer;
    this.#now = options.now ?? (() => new Date());
    this.#pruneInterval = options.pruneIntervalMilliseconds ?? DEFAULT_PRUNE_INTERVAL_MILLISECONDS;
    this.#reportFailure = options.reportFailure ?? writeToStderr;
    this.#service = options.service;
  }

  get busy(): boolean {
    return this.#writing !== null;
  }

  async flush(): Promise<void> {
    if (this.#writing !== null) {
      await this.#writing;
    }
    this.#writing = this.#write();
    try {
      await this.#writing;
    } finally {
      this.#writing = null;
    }
  }

  async #write(): Promise<void> {
    const { occurrences, dropped } = this.#buffer.take();
    if (dropped > 0) {
      this.#report("problems.dropped", { dropped });
    }
    try {
      await recordProblems(this.#database, occurrences);
      await this.#pruneWhenDue();
    } catch (error) {
      this.#report("problems.write_failed", { reason: failureKind(error) });
    }
  }

  async #pruneWhenDue(): Promise<void> {
    const current = this.#now();
    if (current.getTime() - this.#lastPruneAt < this.#pruneInterval) {
      return;
    }
    this.#lastPruneAt = current.getTime();
    await pruneProblemEvents(this.#database, { now: current });
  }

  #report(event: string, fields: Record<string, unknown>): void {
    const current = this.#now().getTime();
    if (current - this.#lastFailureReportAt < FAILURE_REPORT_INTERVAL_MILLISECONDS) {
      return;
    }
    this.#lastFailureReportAt = current;
    const line = { level: "warn", event, service: this.#service, ...fields };
    this.#reportFailure(JSON.stringify(line));
  }
}

/**
 * Starts keeping warnings and errors worth the team's attention in `problem_events` (admin
 * "Problemas"). Logging stays synchronous and cheap: entries are buffered, repeats are counted
 * in memory, and a timer writes them. A failed write is reported once a minute on stderr and
 * dropped: recording a problem never breaks or slows the request or job that had it.
 */
export function installProblemRecorder(
  database: Database,
  options: ProblemRecorderOptions,
): ProblemRecorder {
  const now = options.now ?? (() => new Date());
  const buffer = new ProblemBuffer(options.maximumBatch ?? DEFAULT_MAXIMUM_BATCH);
  const writer = new ProblemWriter(database, buffer, options);
  const stopListening = addProblemLogListener((entry: ProblemLogEntry) => {
    const problem = captureProblem(entry, options.service, now());
    if (problem !== null) {
      buffer.add(problem);
    }
  });
  const timer = setInterval(() => {
    if (!writer.busy) {
      void writer.flush();
    }
  }, options.flushIntervalMilliseconds ?? DEFAULT_FLUSH_INTERVAL_MILLISECONDS);
  timer.unref();

  return {
    flush: async () => writer.flush(),
    stop: () => {
      stopListening();
      clearInterval(timer);
    },
  };
}
