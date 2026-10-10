export type AppErrorCode =
  | "NOT_FOUND"
  | "VALIDATION"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "EXTERNAL_PROVIDER"
  | "EXTERNAL_PROVIDER_AUTH"
  | "CONFIGURATION";

/** Extra, optional information attached to an error (composition instead of subclasses). */
export interface AppErrorDetails {
  /** Whether trying the same operation again can succeed (rate limit, timeout, 5xx). */
  readonly retryable?: boolean;
  /** HTTP status returned by an external provider, when there was one. */
  readonly status?: number | null;
  /** Field-level validation problems. */
  readonly issues?: readonly string[];
}

/**
 * The only error class of the application. Kinds of errors are expressed by `code`
 * and `details` (composition), not by subclasses. Extending the built-in `Error` is
 * required so that stack traces and `throw` semantics keep working.
 */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly userMessage: string;
  readonly details: AppErrorDetails;

  constructor(
    code: AppErrorCode,
    userMessage: string,
    options: { details?: AppErrorDetails; cause?: unknown } = {},
  ) {
    super(userMessage, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.userMessage = userMessage;
    this.details = options.details ?? {};
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

export function hasErrorCode(value: unknown, code: AppErrorCode): value is AppError {
  return isAppError(value) && value.code === code;
}

export function notFoundError(message: string): AppError {
  return new AppError("NOT_FOUND", message);
}

export function validationError(message: string, issues: readonly string[] = []): AppError {
  return new AppError("VALIDATION", message, { details: { issues } });
}

export function unauthorizedError(message = "Você precisa estar autenticado"): AppError {
  return new AppError("UNAUTHORIZED", message);
}

export function forbiddenError(message = "Você não tem permissão para esta ação"): AppError {
  return new AppError("FORBIDDEN", message);
}

export function conflictError(message: string): AppError {
  return new AppError("CONFLICT", message);
}

export function configurationError(message: string): AppError {
  return new AppError("CONFIGURATION", message);
}
