import type { SupportAssistant } from "@sellbridge/shared/support-assistant";

/**
 * Placeholder for the language-model assistant. It makes no network call and always reports
 * "not configured", so the chain falls back to the local FAQ.
 *
 * When it is wired (CLAUDE.local.md): read the key from a Zod-validated env var, call with
 * `AbortSignal.timeout`, retry with backoff only on transient errors, validate the reply with
 * Zod, send no personal data in the prompt, and return `failed` on any error so the FAQ answers.
 * Its answers will need their own storage, since `findFaqAnswer` only knows the curated ids.
 */
export function createDeepseekSupportAssistant(): SupportAssistant {
  return {
    provider: "deepseek",
    answer: async () => ({ kind: "needs_human", reason: "not_configured" }),
  };
}
