export type AppErrorCode =
  | "NOT_FOUND"
  | "VALIDATION"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "CONNECTION"
  | "EXTERNAL_PROVIDER"
  | "CONFIGURATION";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly userMessage: string;

  constructor(code: AppErrorCode, userMessage: string, options?: { cause?: unknown }) {
    super(userMessage, options);
    this.name = new.target.name;
    this.code = code;
    this.userMessage = userMessage;
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super("NOT_FOUND", message);
  }
}

export class ValidationError extends AppError {
  readonly issues: readonly string[];

  constructor(message: string, issues: readonly string[] = []) {
    super("VALIDATION", message);
    this.issues = issues;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Você precisa estar autenticado") {
    super("UNAUTHORIZED", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Você não tem permissão para esta ação") {
    super("FORBIDDEN", message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super("CONFLICT", message);
  }
}

export class ConnectionError extends AppError {
  constructor(message: string) {
    super("CONNECTION", message);
  }
}

export class ExternalProviderError extends AppError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("EXTERNAL_PROVIDER", message, options);
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string) {
    super("CONFIGURATION", message);
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

export type Result<T, E extends AppError = AppError> =
  { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E extends AppError>(error: E): Result<never, E> {
  return { ok: false, error };
}
