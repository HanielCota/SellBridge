import { z } from "zod";

/** A malformed id almost always comes from a mistyped or cut link, not from a form field. */
const INVALID_IDENTIFIER_MESSAGE = "Não encontramos este item. Confira o link ou volte pelo menu";

/**
 * Zod's default messages reach the screen whenever a field has no message of its own, and they
 * come in English ("Too small: expected string…"). Each app calls this once at startup, on the
 * server and in the browser, so the fallback reads in Portuguese. The Portuguese default for a
 * bad id ("Formato do UUID inválido") names a technical term, so it gets a customer's sentence.
 */
export function installPortugueseZodMessages(): void {
  const portuguese = z.locales.ptBR();
  z.config({
    localeError: (issue) => {
      if (issue.code === "invalid_format" && issue.format === "uuid") {
        return INVALID_IDENTIFIER_MESSAGE;
      }
      return portuguese.localeError(issue);
    },
  });
}
