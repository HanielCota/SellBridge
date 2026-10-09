const FALLBACK_MESSAGE = "Ocorreu um erro inesperado. Tente novamente.";

/** Turns anything thrown by a server function or fetch into a message safe to show to the user. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  return FALLBACK_MESSAGE;
}
