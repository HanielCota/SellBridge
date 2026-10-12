export class DeadlineExceededError extends Error {
  constructor(label: string, milliseconds: number) {
    super(`${label} excedeu o prazo de ${milliseconds} ms`);
    this.name = "DeadlineExceededError";
  }
}

/**
 * Resolves with the operation, or rejects with DeadlineExceededError once the deadline passes.
 * The operation itself is not cancelled: callers must tolerate it finishing later.
 */
export async function withDeadline<Result>(
  operation: Promise<Result>,
  milliseconds: number,
  label: string,
): Promise<Result> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new DeadlineExceededError(label, milliseconds)), milliseconds);
  });
  try {
    return await Promise.race([operation, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
