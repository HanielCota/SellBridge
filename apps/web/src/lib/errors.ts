/** What the user sees for any error the app did not word on purpose. */
export const UNEXPECTED_ERROR_MESSAGE = "Ocorreu um erro inesperado. Tente novamente.";

/**
 * Error names whose message the user may read: a server function error arrives as a plain
 * `Error` (the server already replaced unexpected ones), and `AppError` is ours. A `TypeError`,
 * `ReferenceError` or similar comes from a bug or a dropped connection in the browser, and its
 * message ("Cannot read properties of undefined…", "Failed to fetch") means nothing to a user.
 */
const READABLE_ERROR_NAMES = new Set(["Error", "AppError"]);

/** Turns anything thrown by a server function or fetch into a message safe to show to the user. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const isReadable = READABLE_ERROR_NAMES.has(error.name) && error.message.trim().length > 0;
    return isReadable ? error.message : UNEXPECTED_ERROR_MESSAGE;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  return UNEXPECTED_ERROR_MESSAGE;
}
