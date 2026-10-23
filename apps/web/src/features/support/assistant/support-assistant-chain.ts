import type {
  SupportAssistant,
  SupportAssistantProvider,
  SupportNeedsHumanReason,
} from "@sellbridge/shared/support-assistant";
import { createFaqSupportAssistant } from "@sellbridge/shared/support-assistant-faq";
import { createDeepseekSupportAssistant } from "./deepseek-support-assistant";

/** A provider that cannot answer for its own reasons hands the question to the next one. */
const FALLBACK_REASONS: ReadonlySet<SupportNeedsHumanReason> = new Set([
  "not_configured",
  "failed",
]);

/**
 * Asks `primary` first; when it is not configured or failed, `fallback` answers. A decision of
 * the primary itself ("always a person", "nothing matched") stands.
 */
export function withFallback(
  primary: SupportAssistant,
  fallback: SupportAssistant,
): SupportAssistant {
  return {
    provider: primary.provider,
    async answer(question) {
      const result = await primary.answer(question);
      if (result.kind === "answer" || !FALLBACK_REASONS.has(result.reason)) {
        return result;
      }
      return fallback.answer(question);
    },
  };
}

/** The assistant picked by `SUPPORT_ASSISTANT_PROVIDER`, always backed by the local FAQ. */
export function createSupportAssistant(provider: SupportAssistantProvider): SupportAssistant {
  const faq = createFaqSupportAssistant();
  if (provider === "faq") {
    return faq;
  }
  return withFallback(createDeepseekSupportAssistant(), faq);
}
