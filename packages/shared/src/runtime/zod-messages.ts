import { z } from "zod";

/**
 * Zod's default messages reach the screen whenever a field has no message of its own, and they
 * come in English ("Too small: expected string…"). Each app calls this once at startup, on the
 * server and in the browser, so the fallback reads in Portuguese.
 */
export function installPortugueseZodMessages(): void {
  z.config(z.locales.ptBR());
}
